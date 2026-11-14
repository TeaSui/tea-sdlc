// Arena mode: champion/challenger duels for Claude Code assets.
//
// Model: the current artifact on disk is the CHAMPION. "Propose upgrade" output
// registered here becomes the CHALLENGER. Duels replay realistic tasks from a
// per-artifact task bank: both variants answer the same task in parallel (offline,
// via `claude -p` — never inside a live session), a blind judge picks the winner,
// winner gets +1 point. The burden of proof is on the challenger: it is auto-promoted
// onto disk (timestamped backup) only if it reaches config.arena.pointsToWin before
// the champion reaches config.arena.pointsToDefend; otherwise it is retired.
//
// Toggle semantics: config.targets.<type> = false disables BOTH evaluation and
// arena activity for that type — duels are refused and nothing is promoted.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, normalize, sep } from 'node:path';
import { runClaudeRaw, generateUpgrade } from './llm.mjs';
import { resolveTarget } from './evaluate.mjs';
import { ARENA_DIR } from './paths.mjs';

export { ARENA_DIR };
const LEDGER_DIR = join(ARENA_DIR, 'ledgers');
const TASKS_DIR = join(ARENA_DIR, 'tasks');
const CHALLENGER_DIR = join(ARENA_DIR, 'challengers');
const ARCHIVE_DIR = join(ARENA_DIR, 'archive');

const slug = (id) => id.replace(/\//g, '__');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };

const ledgerPath = (id) => join(LEDGER_DIR, slug(id) + '.json');
const tasksPath = (id) => join(TASKS_DIR, slug(id) + '.json');
const challengerPath = (id) => join(CHALLENGER_DIR, slug(id) + '.md');

function stripJson(out) {
  return out.replace(/^```(?:json)?\n?|\n?```\s*$/g, '').trim();
}

export function loadLedger(id) {
  return existsSync(ledgerPath(id)) ? readJson(ledgerPath(id)) : null;
}

export function loadTasks(id) {
  return existsSync(tasksPath(id)) ? readJson(tasksPath(id)) : null;
}

export function saveTasks(id, tasks) {
  writeJson(tasksPath(id), tasks);
}

export function loadChallenger(id) {
  return existsSync(challengerPath(id)) ? readFileSync(challengerPath(id), 'utf8') : null;
}

export function arenaStatus() {
  if (!existsSync(LEDGER_DIR)) return [];
  return readdirSync(LEDGER_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(join(LEDGER_DIR, f)))
    .map((l) => ({ id: l.id, status: l.status, points: l.points, pointsToWin: l.pointsToWin, pointsToDefend: l.pointsToDefend ?? l.pointsToWin, duels: l.duels.length, updatedAt: l.updatedAt }));
}

/** Generate a bank of realistic test prompts for an artifact. */
export async function generateTaskBank(art, config) {
  const content = readFileSync(art.path, 'utf8');
  const n = config.arena.tasksPerArtifact ?? 4;
  const prompt = `You are building a benchmark for a Claude Code ${art.type} instruction file. Write ${n} realistic, concrete user tasks that exercise these instructions — the kind of request a real developer would type, with specific details (file names, scenarios, constraints). Each task must be answerable in a single response and discriminating: a better version of the instructions should produce a visibly better answer.

Respond with ONLY a JSON array: [{"prompt": "<task text>"}, ...]

INSTRUCTION FILE (${art.relPath}):
${content.slice(0, 20_000)}`;
  const res = await runClaudeRaw(prompt, config.arena.executorModel);
  if (!res.ok) throw new Error(`task generation failed: ${res.error}`);
  const tasks = JSON.parse(stripJson(res.output));
  if (!Array.isArray(tasks) || !tasks.length) throw new Error('task generation returned no tasks');
  saveTasks(art.id, tasks);
  return tasks;
}

/** Register a challenger: generate via the upgrade path and open a fresh ledger.
 *  `target` is the directory the artifact was evaluated in; promotion is confined to it. */
export async function registerChallenger(art, config, target = config.target) {
  if (loadLedger(art.id)?.status === 'active') {
    throw new Error(`an active arena already exists for "${art.id}" — discard it first or keep duelling`);
  }
  const gen = await generateUpgrade(art, art.findings ?? [], config.upgrade.model);
  if (!gen.ok) throw new Error(`challenger generation failed: ${gen.error}`);
  mkdirSync(CHALLENGER_DIR, { recursive: true });
  writeFileSync(challengerPath(art.id), gen.content);

  const championContent = readFileSync(art.path, 'utf8');
  const ledger = {
    id: art.id,
    type: art.type,
    path: art.path,
    target: resolveTarget(target),
    status: 'active',
    pointsToWin: config.arena.pointsToWin ?? 10,
    pointsToDefend: Math.min(config.arena.pointsToDefend ?? 4, config.arena.pointsToWin ?? 10),
    points: { champion: 0, challenger: 0 },
    champion: { hash: sha256(championContent) },
    challenger: { hash: sha256(gen.content), generatedAt: new Date().toISOString(), model: config.upgrade.model },
    duels: [],
    updatedAt: new Date().toISOString(),
  };
  writeJson(ledgerPath(art.id), ledger);

  if (!loadTasks(art.id)) await generateTaskBank(art, config);
  return ledger;
}

async function executeVariant(content, task, art, model) {
  const prompt = `You are operating under the following ${art.type} instructions. Follow them exactly as written.

<instructions>
${content.slice(0, 40_000)}
</instructions>

<task>
${task}
</task>

Produce your best complete response to the task, applying the instructions.`;
  const res = await runClaudeRaw(prompt, model);
  if (!res.ok) throw new Error(`variant execution failed: ${res.error}`);
  return res.output;
}

async function judge(task, art, outA, outB, config) {
  // Blind + randomized order: LLM judges are position-biased, so the champion is
  // presented first only ~half the time and labels never reveal which is which.
  const championFirst = Math.random() < 0.5;
  const [r1, r2] = championFirst ? [outA, outB] : [outB, outA];
  // The judge scores the responses, not the instruction files: the file-quality
  // rubric (frontmatter, progressive disclosure, ...) says nothing about an answer.
  const prompt = `You are judging two anonymous responses to the same task. The same model wrote both, each under a different version of a Claude Code ${art.type} instruction file; you are not told which is which.

Pick the response that better serves the person who asked: it is correct, it covers what was asked, it can be used as written, and it invents nothing. Length is not quality — a longer response wins only if the extra content is something the task needed.

Respond with ONLY a JSON object: {"winner": 1 or 2, "reasoning": "<two sentences>"}

<task>
${task}
</task>

<response_1>
${r1.slice(0, 25_000)}
</response_1>

<response_2>
${r2.slice(0, 25_000)}
</response_2>`;
  const res = await runClaudeRaw(prompt, config.arena.judgeModel);
  if (!res.ok) throw new Error(`judging failed: ${res.error}`);
  const verdict = JSON.parse(stripJson(res.output));
  if (verdict.winner !== 1 && verdict.winner !== 2) throw new Error('judge returned no valid winner');
  const winnerIsFirst = verdict.winner === 1;
  const winner = winnerIsFirst === championFirst ? 'champion' : 'challenger';
  return { winner, reasoning: verdict.reasoning ?? '' };
}

/** Run one duel round. Returns the updated ledger (possibly resolved). */
export async function runDuel(id, config) {
  const ledger = loadLedger(id);
  if (!ledger) throw new Error(`no active arena for "${id}" — register a challenger first`);
  if (ledger.status !== 'active') throw new Error(`arena for "${id}" is ${ledger.status}`);
  if (!config.targets[ledger.type]) throw new Error(`type "${ledger.type}" is toggled off — duels refused`);

  const tasks = loadTasks(id);
  if (!tasks?.length) throw new Error(`no task bank for "${id}"`);
  const challenger = loadChallenger(id);
  if (challenger === null) throw new Error(`challenger file missing for "${id}"`);

  // Champion drift guard: if the artifact changed on disk since registration,
  // the duel history no longer describes the current champion.
  const championContent = readFileSync(ledger.path, 'utf8');
  if (sha256(championContent) !== ledger.champion.hash) {
    ledger.status = 'stale';
    ledger.updatedAt = new Date().toISOString();
    writeJson(ledgerPath(id), ledger);
    throw new Error(`champion changed on disk since registration — arena marked stale; re-register the challenger`);
  }

  const task = tasks[ledger.duels.length % tasks.length].prompt;
  const [champOut, challOut] = await Promise.all([
    executeVariant(championContent, task, ledger, config.arena.executorModel),
    executeVariant(challenger, task, ledger, config.arena.executorModel),
  ]);
  const { winner, reasoning } = await judge(task, ledger, champOut, challOut, config);

  ledger.points[winner] += 1;
  ledger.duels.push({ task: task.slice(0, 300), winner, reasoning, at: new Date().toISOString() });
  ledger.updatedAt = new Date().toISOString();

  // Ledgers from before pointsToDefend existed keep their symmetric race.
  if (ledger.points.challenger >= ledger.pointsToWin) {
    promote(ledger, config);
  } else if (ledger.points.champion >= (ledger.pointsToDefend ?? ledger.pointsToWin)) {
    retireChallenger(ledger);
  } else {
    writeJson(ledgerPath(id), ledger);
  }
  return ledger;
}

/** Challenger reached the threshold: back up the champion, write the challenger in. */
export function promote(ledger, config, { manual = false } = {}) {
  if (!config.targets[ledger.type]) throw new Error(`type "${ledger.type}" is toggled off — promotion refused`);
  // Confined to the directory the artifact was evaluated in (recorded at registration),
  // so an arena started with `--target <dir>` can still promote there.
  const target = ledger.target ?? resolveTarget(config.target);
  if (!normalize(ledger.path).startsWith(normalize(target) + sep)) {
    throw new Error('artifact path escapes the evaluated target — refusing promotion');
  }
  const challenger = loadChallenger(ledger.id);
  if (challenger === null) throw new Error('challenger file missing');

  const backup = `${ledger.path}.${Date.now()}.bak`;
  copyFileSync(ledger.path, backup);
  writeFileSync(ledger.path, challenger);

  ledger.status = 'promoted';
  ledger.promotion = { at: new Date().toISOString(), backup, manual };
  ledger.updatedAt = ledger.promotion.at;
  archiveLedger(ledger);
  return ledger;
}

/** Champion defended its slot (or user discarded): retire the challenger. */
export function retireChallenger(ledger, { manual = false } = {}) {
  ledger.status = manual ? 'discarded' : 'defended';
  ledger.updatedAt = new Date().toISOString();
  archiveLedger(ledger);
  return ledger;
}

function archiveLedger(ledger) {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  writeJson(ledgerPath(ledger.id), ledger); // persist final state before renaming away
  const stamp = ledger.updatedAt.replace(/[:.]/g, '-');
  writeJson(join(ARCHIVE_DIR, `${slug(ledger.id)}-${stamp}.json`), ledger);
  // challenger content goes to the archive too, then the active slots are cleared
  const ch = loadChallenger(ledger.id);
  if (ch !== null) {
    writeFileSync(join(ARCHIVE_DIR, `${slug(ledger.id)}-${stamp}.md`), ch);
    renameSync(challengerPath(ledger.id), challengerPath(ledger.id) + '.archived');
  }
  if (existsSync(ledgerPath(ledger.id))) renameSync(ledgerPath(ledger.id), ledgerPath(ledger.id) + '.archived');
  // keep the .archived copies out of arenaStatus by extension filter (.json only)
}
