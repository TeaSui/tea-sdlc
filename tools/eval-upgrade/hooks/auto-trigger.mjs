#!/usr/bin/env node
// PostToolUse hook (registered by the plugin's hooks/hooks.json, matcher "Skill|Task|Agent").
// Runs async (per the hook's "async": true) so it never blocks or appears in the
// transcript. Its ENTIRE job is: decide fast whether an arena duel is due for the
// artifact that just fired in a real session, and if so, hand off to a fully
// detached background process. This script itself must never take more than a
// couple hundred ms — the actual duel work happens outside its lifecycle.
//
// Design constraints (see README.md "Arena" + conversation history):
// - Never prints to stdout — only appends to a log file. A hook that prints
//   arbitrary text risks polluting the transcript even in async mode.
// - Never throws uncaught — always exits 0. A broken hook must fail silently,
//   not break the user's real session.
// - Action is fixed to "duel if a challenger already exists" — this hook never
//   auto-registers a new challenger. Registration is a deliberate, explicit
//   action (`arena.mjs challenger <id>` or the dashboard), never ambient.
// - Recursion guard: if this process tree was itself spawned as part of an
//   auto-trigger firing, EVAL_UPGRADE_AUTO_TRIGGER_ACTIVE is set and we exit
//   immediately — a duel's `claude -p` calls must never cascade into more duels.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { TOOL_ROOT, ARENA_DIR, CONFIG_PATH } from '../lib/paths.mjs';

const LOG_PATH = join(ARENA_DIR, 'auto-trigger.log');
const STATE_PATH = join(ARENA_DIR, 'auto-trigger-state.json');

// Plugin assets arrive namespaced ("tea-sdlc:goal"); arena ids use the bare name.
const bare = (name) => String(name).split(':').pop();

function log(line) {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch { /* logging must never crash the hook */ }
}

async function main() {
  if (process.env.EVAL_UPGRADE_AUTO_TRIGGER_ACTIVE === '1') {
    return; // recursion guard: a spawned duel's own tool use must not re-fire this hook
  }

  let input;
  try {
    const raw = readFileSync(0, 'utf8'); // stdin
    input = raw ? JSON.parse(raw) : {};
  } catch (e) {
    log(`stdin parse failed, exiting quietly: ${e.message}`);
    return;
  }

  const toolName = input.tool_name ?? '';
  const toolInput = input.tool_input ?? {};

  let id = null;
  if (toolName === 'Skill') {
    const name = toolInput.skill;
    if (name) id = `skills/${bare(name)}`;
  } else if (toolName === 'Task' || toolName === 'Agent') {
    const name = toolInput.subagent_type ?? toolInput.subagentType ?? toolInput.agent_type;
    if (name) id = `agents/${bare(name)}`;
  } else {
    return; // not a tool this hook cares about
  }
  if (!id) {
    log(`no artifact id resolved for tool_name=${toolName}, tool_input keys=${Object.keys(toolInput)}`);
    return;
  }

  // No config file means defaults, and auto-trigger defaults to off: nothing to do.
  if (!existsSync(CONFIG_PATH)) return;
  let config;
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    log(`config.json unreadable, exiting quietly: ${e.message}`);
    return;
  }

  // The file may hold only the keys the user changed; absent keys take their defaults
  // (enabled: true, every type on, autoTrigger off).
  if (config.enabled === false) return;
  if (!config.autoTrigger?.enabled) return;
  const [type] = id.split('/');
  if (config.targets?.[type] === false) {
    log(`${id}: type "${type}" is toggled off — not firing`);
    return;
  }

  // Throttle: default "day" — once per calendar day per artifact.
  const throttle = config.autoTrigger.throttle ?? 'day';
  let state = {};
  try { if (existsSync(STATE_PATH)) state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { /* start fresh */ }
  const today = new Date().toISOString().slice(0, 10);
  if (throttle === 'day' && state[id] === today) {
    return; // already fired today, stay silent
  }
  if (throttle === 'session' && state[id] === input.session_id) {
    return;
  }

  // Only duel if a challenger already exists and is active — this hook never registers one.
  const ledgerPath = join(ARENA_DIR, 'ledgers', id.replace(/\//g, '__') + '.json');
  if (!existsSync(ledgerPath)) {
    log(`${id}: no active arena, skipping (this hook never auto-registers a challenger)`);
    return;
  }
  let ledger;
  try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')); } catch { return; }
  if (ledger.status !== 'active') {
    log(`${id}: arena status is "${ledger.status}", not "active" — skipping`);
    return;
  }

  const rounds = config.autoTrigger.roundsPerFire ?? 1;
  log(`${id}: firing background duel (${rounds} round(s))`);

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  const fd = openSync(LOG_PATH, 'a');
  const child = spawn('node', ['bin/arena.mjs', 'duel', id, String(rounds)], {
    cwd: TOOL_ROOT,
    env: { ...process.env, EVAL_UPGRADE_AUTO_TRIGGER_ACTIVE: '1' },
    stdio: ['ignore', fd, fd],
    detached: true,
  });
  child.unref();

  state[id] = throttle === 'session' ? input.session_id : today;
  try { writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n'); } catch { /* best effort */ }
}

main().catch((e) => log(`unexpected error: ${e.stack ?? e.message}`));
