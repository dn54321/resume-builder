#!/usr/bin/env bash
#
# setup.sh — Sync env files from .template files
#
# Scans the project root, backend/, and frontend/ for *.template files.
# For each template, ensures the corresponding file (without .template)
# exists, fills in missing keys, and reorders keys/comments to match
# the template structure. Existing values are preserved.
#
# Template values starting with < and ending with > are generator functions:
#   <ENC:AES-256>   → generates a 256-bit AES key (64 hex chars)
#   <RANDOM:32>     → generates 32 random alphanumeric characters
#
# Usage: ./setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Directories to scan (relative to script location)
SCAN_DIRS=("." "backend" "frontend")

# ---------------------------------------------------------------------------
# Helper: extract the key name from a "KEY=VALUE" line
# ---------------------------------------------------------------------------
extract_key() {
  local line="$1"
  echo "${line%%=*}"
}

# ---------------------------------------------------------------------------
# Helper: extract the value from a "KEY=VALUE" line (everything after the =)
# ---------------------------------------------------------------------------
extract_value() {
  local line="$1"
  echo "${line#*=}"
}

# ---------------------------------------------------------------------------
# Read a file into an array (preserving empty lines and order)
# ---------------------------------------------------------------------------
read_lines() {
  local file="$1"
  local -n out_arr="$2"
  out_arr=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    out_arr+=("$line")
  done < "$file"
}

# ---------------------------------------------------------------------------
# Determine if a line is a comment (starts with #, possibly with whitespace)
# ---------------------------------------------------------------------------
is_comment() {
  local line="$1"
  [[ "$line" =~ ^[[:space:]]*# ]]
}

# ---------------------------------------------------------------------------
# Determine if a line is a key=value pair
# ---------------------------------------------------------------------------
is_keyval() {
  local line="$1"
  [[ "$line" == *"="* && ! "$line" =~ ^[[:space:]]*# ]]
}

# ---------------------------------------------------------------------------
# Check if a value is a generator placeholder: <FUNC:ARG>
# ---------------------------------------------------------------------------
is_placeholder() {
  local value="$1"
  [[ "$value" =~ ^\<[A-Z_]+:[A-Za-z0-9_-]+\>$ ]]
}

# ---------------------------------------------------------------------------
# Check if a value is "real" (non-empty, not a placeholder)
# ---------------------------------------------------------------------------
is_real_value() {
  local value="$1"
  [[ -n "$value" ]] && ! is_placeholder "$value"
}

# ---------------------------------------------------------------------------
# Resolve a generator placeholder like <ENC:AES-256> or <RANDOM:32>
# Returns the generated value on stdout.
# ---------------------------------------------------------------------------
resolve_placeholder() {
  local placeholder="$1"

  # Strip < and >
  local inner="${placeholder:1:$(( ${#placeholder} - 2 ))}"
  local func="${inner%%:*}"
  local arg="${inner#*:}"

  case "$func" in
    ENC)
      case "$arg" in
        AES-256)
          # 32 bytes = 256 bits, hex-encoded = 64 chars
          openssl rand -hex 32 2>/dev/null || {
            # Fallback: /dev/urandom + od
            local raw
            raw="$(od -A n -t x1 -N 32 /dev/urandom 2>/dev/null | tr -d ' \n')"
            echo "$raw"
          }
          ;;
        *)
          echo "ERROR: Unknown encryption algorithm: $arg" >&2
          echo "<${func}:${arg}>"
          ;;
      esac
      ;;
    RANDOM)
      # Generate a random alphanumeric string of length $arg
      if [[ "$arg" =~ ^[0-9]+$ ]]; then
        local len="$arg"
        # Use openssl if available, fallback to /dev/urandom
        openssl rand -base64 $(( (len * 3 + 3) / 4 )) 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c "$len" || {
          LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c "$len"
        }
        echo
      else
        echo "ERROR: RANDOM requires a numeric length argument" >&2
        echo "<${func}:${arg}>"
      fi
      ;;
    *)
      echo "ERROR: Unknown generator function: $func" >&2
      echo "<${func}:${arg}>"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Sync a single template -> target pair
# ---------------------------------------------------------------------------
sync_template() {
  local template_file="$1"
  local target_file="${template_file%.template}"

  echo "━━━ ${template_file} → ${target_file} ━━━"

  # Read both files into arrays
  local -a tmpl_lines=()
  local -a exist_lines=()
  read_lines "$template_file" tmpl_lines

  # Build lookup: existing key → full line, and key → value
  local -A exist_map=()
  local -A exist_val=()
  local -a exist_extra_comments=()

  if [[ -f "$target_file" ]]; then
    read_lines "$target_file" exist_lines

    for eline in "${exist_lines[@]}"; do
      if is_keyval "$eline"; then
        local ekey
        ekey="$(extract_key "$eline")"
        exist_map["$ekey"]="$eline"
        exist_val["$ekey"]="$(extract_value "$eline")"
      elif is_comment "$eline"; then
        # Collect comments unique to the existing file
        local found=0
        for tline in "${tmpl_lines[@]}"; do
          if [[ "$tline" == "$eline" ]]; then
            found=1
            break
          fi
        done
        if [[ "$found" -eq 0 ]]; then
          exist_extra_comments+=("$eline")
        fi
      fi
    done
  fi

  # Build output: iterate template in order
  local -a output=()
  local -A placed_keys=()

  for tline in "${tmpl_lines[@]}"; do
    if is_keyval "$tline"; then
      local tkey tval
      tkey="$(extract_key "$tline")"
      tval="$(extract_value "$tline")"
      placed_keys["$tkey"]=1

      if [[ -n "${exist_val[$tkey]+set}" ]]; then
        # Key exists in target
        local eval="${exist_val[$tkey]}"

        if is_real_value "$eval"; then
          # Target has a real value → keep it as-is
          output+=("${exist_map[$tkey]}")
        else
          # Target value is empty or also a placeholder → resolve from template
          if is_placeholder "$tval"; then
            local generated
            generated="$(resolve_placeholder "$tval")"
            output+=("${tkey}=${generated}")
            echo "   🔑 Generated $tkey (was empty/placeholder)"
          else
            # Template has a plain value, target was empty → use template value
            output+=("$tline")
            echo "   + Added missing value for: $tkey"
          fi
        fi
      else
        # Key missing from target
        if is_placeholder "$tval"; then
          local generated
          generated="$(resolve_placeholder "$tval")"
          output+=("${tkey}=${generated}")
          echo "   🔑 Generated $tkey (new key)"
        else
          output+=("$tline")
          echo "   + Added missing key: $tkey"
        fi
      fi
    elif is_comment "$tline"; then
      output+=("$tline")
    else
      # Blank line or other — include as-is
      output+=("$tline")
    fi
  done

  # Append extra comments from existing file that aren't in template
  if [[ ${#exist_extra_comments[@]} -gt 0 ]]; then
    output+=("")
    for comment in "${exist_extra_comments[@]}"; do
      output+=("$comment")
    done
  fi

  # Append any existing keys NOT in the template (at the end)
  local -a extra_keys=()
  for ekey in "${!exist_map[@]}"; do
    if [[ -z "${placed_keys[$ekey]+set}" ]]; then
      extra_keys+=("${exist_map[$ekey]}")
    fi
  done

  if [[ ${#extra_keys[@]} -gt 0 ]]; then
    output+=("")
    for keyval in "${extra_keys[@]}"; do
      output+=("$keyval")
      local ek
      ek="$(extract_key "$keyval")"
      echo "   ↪ Preserved extra key: $ek"
    done
  fi

  # Write output
  printf '%s\n' "${output[@]}" > "$target_file"
  echo "   ✓ Synced"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
cd "$SCRIPT_DIR"

found_any=0
for dir in "${SCAN_DIRS[@]}"; do
  if [[ ! -d "$dir" ]]; then
    continue
  fi

  while IFS= read -r -d '' template; do
    # Skip node_modules
    if [[ "$template" == *"/node_modules/"* ]]; then
      continue
    fi
    sync_template "$template"
    found_any=1
  done < <(find "$dir" -maxdepth 1 -name "*.template" -type f -print0 2>/dev/null || true)
done

if [[ "$found_any" -eq 0 ]]; then
  echo "No .template files found in ${SCAN_DIRS[*]}"
fi

echo ""
echo "Done."
