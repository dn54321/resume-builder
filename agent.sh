#!/bin/bash
# agent.sh — Pick a Linear epic/ticket and launch the agent TUI.
#
# Usage: ./agent.sh
#
# Lists all active epics and top-level tickets from Linear,
# lets you pick one interactively, and launches the CLI dashboard.

# Ensure we run under bash (not fish, zsh, etc.)
if [ -z "${BASH_VERSION:-}" ]; then
  exec /bin/bash "$0" "$@"
fi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_PATH="$SCRIPT_DIR/.pi/extensions/ticket/cli.ts"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR")"

# ─── Find Linear API key ─────────────────────────────────────────────

find_api_key() {
  if [ -n "${LINEAR_API_KEY:-}" ]; then
    echo "$LINEAR_API_KEY"
    return
  fi

  local cred_file="$HOME/.pi/agent/extensions/linear/credentials.json"
  if [ -f "$cred_file" ]; then
    node -e "
      try {
        const c = require('$cred_file');
        const a = c.activeWorkspace;
        if (a && c.workspaces && c.workspaces[a]) {
          process.stdout.write(c.workspaces[a].apiKey || '');
        } else {
          const first = Object.keys(c.workspaces || {})[0];
          process.stdout.write(first ? (c.workspaces[first].apiKey || '') : '');
        }
      } catch(_) { process.stdout.write(''); }
    " 2>/dev/null
  fi
}

API_KEY="$(find_api_key)"
if [ -z "$API_KEY" ]; then
  echo "Error: No LINEAR_API_KEY found."
  echo "  Set the LINEAR_API_KEY environment variable, or"
  echo "  run /linear-auth inside pi to configure credentials."
  exit 1
fi

# ─── Fetch issues from Linear ────────────────────────────────────────

echo "Fetching active epics and tickets from Linear..." >&2

ISSUES_JSON=$(node -e "
const https = require('https');

const query = \`query {
  issues(
    first: 100
    filter: {
      state: { type: { nin: [\"completed\", \"canceled\"] } }
      parent: { null: true }
    }
    orderBy: updatedAt
  ) {
    nodes {
      identifier
      title
      state { name type }
      priority
      children { nodes { id } }
      assignee { name }
    }
  }
}\`;

const body = JSON.stringify({ query });

const req = https.request({
  hostname: 'api.linear.app',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Authorization': '$API_KEY',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.errors) {
        process.stderr.write('Linear API error: ' + JSON.stringify(json.errors) + '\\n');
        process.exit(1);
      }
      const issues = json.data?.issues?.nodes ?? [];

      // Sort: epics (with children) first by priority, then standalone
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      issues.sort((a, b) => {
        const aChild = a.children.nodes.length > 0 ? 0 : 1;
        const bChild = b.children.nodes.length > 0 ? 0 : 1;
        if (aChild !== bChild) return aChild - bChild;
        const aP = priorityOrder[a.priority] ?? 4;
        const bP = priorityOrder[b.priority] ?? 4;
        return aP - bP;
      });

      // Output as TSV: identifier<TAB>type<TAB>priority<TAB>children<TAB>assignee<TAB>title
      for (const i of issues) {
        const childCount = i.children.nodes.length;
        const type = childCount > 0 ? 'EPIC' : 'TICKET';
        const assignee = i.assignee?.name || 'unassigned';
        const priority = (i.priority || 'none').toUpperCase();
        process.stdout.write(
          i.identifier + '\\t' +
          type + '\\t' +
          priority + '\\t' +
          (childCount > 0 ? childCount + ' sub-issues' : '—') + '\\t' +
          assignee + '\\t' +
          i.title + '\\n'
        );
      }
    } catch(e) {
      process.stderr.write('Failed to parse response: ' + e.message + '\\n');
      process.exit(1);
    }
  });
});

req.on('error', e => {
  process.stderr.write('Network error: ' + e.message + '\\n');
  process.exit(1);
});

req.write(body);
req.end();
" 2>/dev/null)

if [ -z "$ISSUES_JSON" ]; then
  echo "Error: No active issues returned from Linear." >&2
  exit 1
fi

# ─── Interactive picker ──────────────────────────────────────────────

if command -v fzf &>/dev/null; then
  # ── fzf picker (rich interactive UI) ──────────────────────────

  SELECTED=$(echo "$ISSUES_JSON" | SHELL=/bin/bash fzf \
    --delimiter='\t' \
    --with-nth='1,2,3,4,5' \
    --header='↑↓:navigate  Enter:select  ESC:quit   (epics sorted first)' \
    --preview='
      id={1}; type={2}; pri={3}; children={4}; who={5}
      echo -e "ID:        $id"
      echo -e "Type:      $type"
      echo -e "Priority:  $pri"
      echo -e "Children:  $children"
      echo -e "Assignee:  $who"
    ' \
    --preview-window='right:35%' \
    --bind='ctrl-c:abort' \
    --height=30 \
    --layout=reverse \
    --border=rounded \
    --prompt='Pick an epic or ticket > ')

  if [ -z "$SELECTED" ]; then
    echo "No selection made. Exiting." >&2
    exit 0
  fi

  TICKET_ID=$(echo "$SELECTED" | cut -f1)

else
  # ── Fallback: numbered list ───────────────────────────────────

  echo ""
  echo "Active epics and tickets:"
  echo "-------------------------"

  # Read into array for indexed access
  IFS=$'\n' read -d '' -ra LINES <<< "$ISSUES_JSON" || true

  for i in "${!LINES[@]}"; do
    IFS=$'\t' read -ra FIELDS <<< "${LINES[$i]}"
    printf "  %2d) %-10s %-6s %-10s %-12s %s\n" \
      $((i + 1)) \
      "${FIELDS[0]}" \
      "${FIELDS[1]}" \
      "${FIELDS[2]}" \
      "${FIELDS[3]}" \
      "${FIELDS[5]}"
  done

  echo ""
  read -rp "Pick a number (1-${#LINES[@]}, or Enter to quit): " choice

  if [ -z "$choice" ]; then
    echo "No selection made. Exiting." >&2
    exit 0
  fi

  if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#LINES[@]}" ]; then
    echo "Invalid selection: $choice" >&2
    exit 1
  fi

  IFS=$'\t' read -ra FIELDS <<< "${LINES[$((choice - 1))]}"
  TICKET_ID="${FIELDS[0]}"
fi

echo "" >&2
echo "Launching agent TUI for $TICKET_ID..." >&2

# ─── Launch CLI ──────────────────────────────────────────────────────

export LINEAR_API_KEY="$API_KEY"
cd "$REPO_ROOT"

# Find tsx (try local, then global, then npx)
TSX=""
if [ -x "$REPO_ROOT/node_modules/.bin/tsx" ]; then
  TSX="$REPO_ROOT/node_modules/.bin/tsx"
elif [ -x "$HOME/projects/node_modules/.pnpm/node_modules/.bin/tsx" ]; then
  TSX="$HOME/projects/node_modules/.pnpm/node_modules/.bin/tsx"
else
  TSX="npx tsx"
fi

exec $TSX "$CLI_PATH" "$TICKET_ID"
