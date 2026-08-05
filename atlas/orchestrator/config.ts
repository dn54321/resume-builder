/**
 * Atlas configuration loader.
 * Reads atlas.config.yaml and returns a validated AtlasConfig object.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AtlasConfig } from './types';

// Lazy-loaded YAML parser
let yamlParse: ((text: string) => any) | null = null;

function getYamlParser(): (text: string) => any {
  if (yamlParse) return yamlParse;
  // Try to require yaml — it's a dependency of the project
  try {
    const yaml = require('yaml');
    yamlParse = (text: string) => yaml.parse(text);
  } catch {
    // Fallback: use a simple YAML parser for the subset we need
    yamlParse = simpleYamlParse;
  }
  return yamlParse;
}

// Minimal YAML parser for the Atlas config subset (used as fallback)
function simpleYamlParse(text: string): any {
  // This is intentionally minimal. In production, the `yaml` npm package
  // should be installed. This fallback handles the common patterns in
  // atlas.config.yaml.
  const lines = text.split('\n');
  const root: Record<string, any> = {};
  const stack: Array<Record<string, any>> = [root];
  const indentStack: number[] = [0];
  let currentKey = '';

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    // Pop stack to find parent
    while (indentStack.length > 1 && indent <= indentStack[indentStack.length - 2]!) {
      stack.pop();
      indentStack.pop();
    }

    const current = stack[stack.length - 1]!;

    // Key: value
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1]!;
      const val = kvMatch[2]!;

      if (val === '' || val === '{}') {
        // Nested object follows
        const obj: Record<string, any> = {};
        current[key] = obj;
        stack.push(obj);
        indentStack.push(indent);
      } else if (val.startsWith('"') && val.endsWith('"')) {
        current[key] = val.slice(1, -1);
      } else if (val === 'true') {
        current[key] = true;
      } else if (val === 'false') {
        current[key] = false;
      } else if (!isNaN(Number(val)) && val !== '') {
        current[key] = Number(val);
      } else {
        current[key] = val;
      }
      continue;
    }

    // - list item
    const listMatch = trimmed.match(/^\s*-\s+(.*)$/);
    if (listMatch) {
      const val = listMatch[1]!;
      if (!Array.isArray(current[currentKey])) {
        current[currentKey] = [];
      }
      current[currentKey].push(
        val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1) : val,
      );
      continue;
    }
  }

  return root;
}

// ─── Defaults ───────────────────────────────────────────────────────

const DEFAULTS: AtlasConfig = {
  version: '2.0',
  agents: {
    max_concurrent: 3,
    boss: {
      enabled: true,
      prompt_file: 'agents/boss/prompt.md',
      pre_script: 'agents/boss/pre.sh',
      post_script: 'agents/boss/post.sh',
      spawn: 'manual',
      max_instances: 1,
    },
    worker: {
      enabled: true,
      prompt_file: 'agents/worker/prompt.md',
      pre_script: 'agents/worker/pre.sh',
      post_script: 'agents/worker/post.sh',
      spawn: 'on_demand',
      max_instances: 5,
      max_lifetime_spawns: 20,
      retry_limit: 2,
      task_timeout_minutes: 30,
    },
    reviewer: {
      enabled: false,
      prompt_file: 'agents/reviewer/prompt.md',
      pre_script: 'agents/reviewer/pre.sh',
      post_script: 'agents/reviewer/post.sh',
      spawn: 'on_pr_opened',
      max_instances: 1,
    },
    pr_manager: {
      enabled: false,
      prompt_file: 'agents/pr-manager/prompt.md',
      pre_script: 'agents/pr-manager/pre.sh',
      post_script: 'agents/pr-manager/post.sh',
      spawn: 'schedule',
      max_instances: 1,
      auto_merge_threshold_hours: 24,
      cleanup_stale_branches_days: 7,
    },
  },
  strategy: {
    default: 'pr',
    branches: {
      pr_target: 'master',
      review_target: 'staging',
      direct_push: 'master',
      worktree_base: 'master',
    },
    overrides: [],
  },
  intervals: {
    status_sync: 10,
    pr_scan: 10,
    dashboard_refresh: 2,
    agent_health: 15,
    queue_process: 5,
    scheduled_agents: 300,
    webhook_timeout: 30,
  },
  linear: {
    team_key: 'RES',
    transitions: {
      on_start: 'In Progress',
      on_done: 'Done',
      on_failure: 'Todo',
      on_review: 'In Review',
    },
    cache_ttl_minutes: 15,
    max_retries_on_rate_limit: 3,
    retry_backoff_ms: 1000,
    auto_discover_epics: true,
  },
  github: {
    webhook_enabled: true,
    pr_labels: ['atlas', 'ai-generated'],
    pr_draft: false,
    merge_method: 'squash',
    delete_branch_on_merge: true,
    required_approvals: 1,
  },
  ports: {
    min: 9000,
    max: 9099,
  },
  logging: {
    level: 'info',
    max_log_lines_per_agent: 5000,
    retain_logs_days: 30,
  },
  testing: {
    mock_external_services: false,
    coverage_threshold: 90,
    fixtures_dir: 'tests/fixtures',
  },
};

// ─── Deep merge ─────────────────────────────────────────────────────

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const ov = override[key];
    const bv = base[key];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      (result as any)[key] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      (result as any)[key] = ov;
    }
  }
  return result;
}

// ─── Validation ─────────────────────────────────────────────────────

function validate(config: AtlasConfig): void {
  if (config.agents.max_concurrent < 1) {
    throw new Error('agents.max_concurrent must be >= 1');
  }
  if (config.ports.max <= config.ports.min) {
    throw new Error('ports.max must be > ports.min');
  }
  const validStrategies: string[] = ['pr', 'direct', 'review'];
  if (!validStrategies.includes(config.strategy.default)) {
    throw new Error(`strategy.default must be one of: ${validStrategies.join(', ')}`);
  }
  // Validate interval keys are positive
  for (const [key, value] of Object.entries(config.intervals)) {
    if (value < 1) {
      throw new Error(`intervals.${key} must be >= 1`);
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────

let _cachedConfig: AtlasConfig | null = null;
let _configPath: string | null = null;

/**
 * Load and validate the Atlas configuration.
 * Merges user config with defaults. Caches the result.
 */
export function loadConfig(configPath?: string): AtlasConfig {
  const resolvedPath = configPath ?? findConfigFile();
  if (_cachedConfig && _configPath === resolvedPath) {
    return _cachedConfig;
  }

  let userConfig: Partial<AtlasConfig> = {};

  if (fs.existsSync(resolvedPath)) {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const parse = getYamlParser();
    userConfig = parse(raw) as Partial<AtlasConfig>;
  }

  // Deep merge with defaults
  const merged = deepMerge(DEFAULTS, userConfig);

  // Resolve relative paths in agent definitions
  const configDir = path.dirname(resolvedPath);
  for (const agentType of ['boss', 'worker', 'reviewer', 'pr_manager'] as const) {
    const agent = merged.agents[agentType];
    if (agent.prompt_file && !path.isAbsolute(agent.prompt_file)) {
      agent.prompt_file = path.resolve(configDir, agent.prompt_file);
    }
    if (agent.pre_script && !path.isAbsolute(agent.pre_script)) {
      agent.pre_script = path.resolve(configDir, agent.pre_script);
    }
    if (agent.post_script && !path.isAbsolute(agent.post_script)) {
      agent.post_script = path.resolve(configDir, agent.post_script);
    }
  }

  validate(merged);

  _cachedConfig = merged;
  _configPath = resolvedPath;

  return merged;
}

/**
 * Get the cached configuration. Throws if not loaded.
 */
export function getConfig(): AtlasConfig {
  if (!_cachedConfig) {
    return loadConfig();
  }
  return _cachedConfig;
}

/**
 * Reload the configuration from disk.
 */
export function reloadConfig(): AtlasConfig {
  _cachedConfig = null;
  _configPath = null;
  return loadConfig();
}

/**
 * Find the atlas.config.yaml file.
 * Searches: ATLAS_CONFIG env var, then cwd, then parent dirs.
 */
function findConfigFile(): string {
  if (process.env.ATLAS_CONFIG && fs.existsSync(process.env.ATLAS_CONFIG)) {
    return process.env.ATLAS_CONFIG;
  }

  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'atlas.config.yaml');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Return default location
  return path.join(process.cwd(), 'atlas.config.yaml');
}
