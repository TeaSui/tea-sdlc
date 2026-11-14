// Code and state live apart. The code ships inside the plugin, whose install
// directory is replaced on every plugin update; results, proposals, arena ledgers
// and the user's config must survive that, so they live in a state directory.
//
// The state directory is one fixed path (not ${CLAUDE_PLUGIN_DATA}) on purpose:
// the CLI runs from a Bash tool call and the auto-trigger runs as a hook, and only
// hooks receive plugin environment variables. Both must resolve the same ledgers.
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STATE_DIR = process.env.EVAL_UPGRADE_STATE_DIR
  ? resolve(process.env.EVAL_UPGRADE_STATE_DIR)
  : join(homedir(), '.claude', 'state', 'eval-upgrade');

export const CONFIG_PATH = join(STATE_DIR, 'config.json');
export const RESULTS_DIR = join(STATE_DIR, 'results');
export const PROPOSALS_DIR = join(STATE_DIR, 'proposals');
export const ARENA_DIR = join(STATE_DIR, 'arena');
