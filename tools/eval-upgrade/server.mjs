#!/usr/bin/env node
// Localhost dashboard + control API for the eval-upgrade system.
//
// Security model (this server can write files, so it is hardened even on localhost):
// - Binds 127.0.0.1 only.
// - A random session token is generated at startup and embedded in the printed URL.
//   Every mutating endpoint (POST/PUT) requires it — a hostile webpage can fire
//   fetch('http://127.0.0.1:4600/...') but cannot know the token.
// - Host header must be 127.0.0.1/localhost to blunt DNS-rebinding.
// - Responses use the { data, meta } / { error } envelope per rules/patterns.md.
// - Apply/promotion refuse when the target file changed since generation
//   (content-hash guards) and always write a timestamped backup.
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, runEvaluation, resolveTarget, RESULTS_DIR, PROPOSALS_DIR, DEFAULT_CONFIG } from './lib/evaluate.mjs';
import { generateUpgrade } from './lib/llm.mjs';
import { registerChallenger, runDuel, arenaStatus, loadLedger, loadTasks, saveTasks, loadChallenger, promote, retireChallenger } from './lib/arena.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(ROOT, 'ui');
const PORT = Number(process.env.EVAL_UPGRADE_PORT ?? 4600);
const TOKEN = randomBytes(16).toString('hex');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

let running = false; // single-flight guard for evaluation runs
let arenaBusy = false; // single-flight guard for duels / challenger generation

const ok = (res, data, extraMeta = {}) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data, meta: { timestamp: new Date().toISOString(), ...extraMeta } }));
};
const fail = (res, code, errCode, message, details = []) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: errCode, message, details } }));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
});

const proposalBase = (id) => join(PROPOSALS_DIR, id.replace(/\//g, '__'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function latestResults() {
  const p = join(RESULTS_DIR, 'latest.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    // --- DNS-rebinding guard: only accept loopback Host headers ---
    const hostname = (req.headers.host ?? '').split(':')[0];
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
      return fail(res, 403, 'BAD_HOST', 'Host header is not loopback');
    }

    const isApi = url.pathname.startsWith('/api/');
    const isMutation = isApi && req.method !== 'GET';
    if (isMutation) {
      const token = req.headers['x-auth-token'] ?? url.searchParams.get('token');
      if (token !== TOKEN) return fail(res, 401, 'BAD_TOKEN', 'Missing or invalid session token');
    }

    // ---- API ----
    if (url.pathname === '/api/config' && req.method === 'GET') return ok(res, loadConfig());
    if (url.pathname === '/api/config' && req.method === 'PUT') {
      const body = await readBody(req);
      const cfg = loadConfig();
      if (typeof body.enabled === 'boolean') cfg.enabled = body.enabled;
      if (typeof body.target === 'string' && body.target.trim()) cfg.target = body.target.trim();
      if (body.targets && typeof body.targets === 'object') {
        for (const t of Object.keys(DEFAULT_CONFIG.targets)) {
          if (typeof body.targets[t] === 'boolean') cfg.targets[t] = body.targets[t];
        }
      }
      if (body.llmReview && typeof body.llmReview.enabled === 'boolean') cfg.llmReview.enabled = body.llmReview.enabled;
      saveConfig(cfg);
      return ok(res, cfg);
    }
    if (url.pathname === '/api/results/latest' && req.method === 'GET') {
      const r = latestResults();
      return r ? ok(res, r) : fail(res, 404, 'NO_RESULTS', 'No results yet — run an evaluation');
    }
    if (url.pathname === '/api/results' && req.method === 'GET') {
      const files = existsSync(RESULTS_DIR)
        ? readdirSync(RESULTS_DIR).filter((f) => f.startsWith('run-')).sort().reverse()
        : [];
      return ok(res, { runs: files });
    }
    if (url.pathname === '/api/run' && req.method === 'POST') {
      if (running) return fail(res, 409, 'RUN_IN_PROGRESS', 'An evaluation is already running');
      running = true;
      try {
        const results = await runEvaluation({});
        return ok(res, results);
      } finally {
        running = false;
      }
    }
    if (url.pathname === '/api/upgrade' && req.method === 'POST') {
      const { id } = await readBody(req);
      const results = latestResults();
      const art = results?.artifacts.find((a) => a.id === id);
      if (!art) return fail(res, 404, 'UNKNOWN_ARTIFACT', `Artifact "${id}" not in latest results`);
      const cfg = loadConfig();
      const sourceHash = sha256(readFileSync(art.path));
      const gen = await generateUpgrade(art, art.findings ?? [], cfg.upgrade.model);
      if (!gen.ok) return fail(res, 502, 'LLM_FAILED', gen.error);
      mkdirSync(PROPOSALS_DIR, { recursive: true });
      writeFileSync(proposalBase(id) + '.md', gen.content);
      writeFileSync(proposalBase(id) + '.meta.json', JSON.stringify({ id, sourceHash, generatedAt: new Date().toISOString(), model: cfg.upgrade.model }, null, 2));
      return ok(res, { id, proposal: gen.content, applyAllowed: art.type !== 'hooks' });
    }
    if (url.pathname === '/api/proposal' && req.method === 'GET') {
      const id = url.searchParams.get('id') ?? '';
      const p = proposalBase(id) + '.md';
      if (!existsSync(p)) return fail(res, 404, 'NO_PROPOSAL', 'No proposal for this artifact');
      const meta = existsSync(proposalBase(id) + '.meta.json') ? JSON.parse(readFileSync(proposalBase(id) + '.meta.json', 'utf8')) : null;
      return ok(res, { id, proposal: readFileSync(p, 'utf8'), meta });
    }
    if (url.pathname === '/api/apply' && req.method === 'POST') {
      const { id, confirm } = await readBody(req);
      if (confirm !== true) return fail(res, 400, 'NO_CONFIRM', 'Apply requires {"confirm": true}');
      const results = latestResults();
      const art = results?.artifacts.find((a) => a.id === id);
      const p = proposalBase(id) + '.md';
      const metaP = proposalBase(id) + '.meta.json';
      if (!art || !existsSync(p)) return fail(res, 404, 'NOT_FOUND', 'Artifact or proposal not found');
      // Safety: only ever write inside the directory the latest run evaluated
      const target = results.target ?? resolveTarget(loadConfig().target);
      if (!normalize(art.path).startsWith(normalize(target) + sep)) {
        return fail(res, 400, 'PATH_ESCAPE', 'Artifact path escapes the configured target — refusing');
      }
      // Staleness guard: the file must be byte-identical to when the proposal was generated
      const meta = existsSync(metaP) ? JSON.parse(readFileSync(metaP, 'utf8')) : null;
      if (!meta?.sourceHash || sha256(readFileSync(art.path)) !== meta.sourceHash) {
        return fail(res, 409, 'STALE_PROPOSAL', 'Source file changed since this proposal was generated. Re-run evaluation and regenerate the proposal.');
      }
      const backup = `${art.path}.${Date.now()}.bak`;
      copyFileSync(art.path, backup);
      writeFileSync(art.path, readFileSync(p, 'utf8'));
      return ok(res, { id, applied: true, backup });
    }

    // ---- Arena ----
    if (url.pathname === '/api/arena/status' && req.method === 'GET') {
      return ok(res, { arenas: arenaStatus() });
    }
    if (url.pathname === '/api/arena/detail' && req.method === 'GET') {
      const id = url.searchParams.get('id') ?? '';
      const ledger = loadLedger(id);
      if (!ledger) return fail(res, 404, 'NO_ARENA', `No arena for "${id}" — register a challenger first`);
      let championContent = null;
      try { championContent = readFileSync(ledger.path, 'utf8'); } catch { /* deleted since */ }
      return ok(res, { ledger, championContent, challengerContent: loadChallenger(id), tasks: loadTasks(id) });
    }
    if (url.pathname === '/api/arena/challenger' && req.method === 'POST') {
      if (arenaBusy) return fail(res, 409, 'ARENA_BUSY', 'An arena operation is already running');
      arenaBusy = true;
      try {
        const { id } = await readBody(req);
        const results = latestResults();
        const art = results?.artifacts.find((a) => a.id === id);
        if (!art) return fail(res, 404, 'UNKNOWN_ARTIFACT', `Artifact "${id}" not in latest results`);
        const cfg = loadConfig();
        if (!cfg.targets[art.type]) return fail(res, 403, 'TYPE_OFF', `Type "${art.type}" is toggled off — arena refused`);
        const existing = loadLedger(id);
        if (existing?.status === 'active') return fail(res, 409, 'ARENA_EXISTS', 'An active arena already exists for this artifact');
        const ledger = await registerChallenger(art, cfg, results.target);
        return ok(res, { ledger });
      } finally {
        arenaBusy = false;
      }
    }
    if (url.pathname === '/api/arena/duel' && req.method === 'POST') {
      if (arenaBusy) return fail(res, 409, 'ARENA_BUSY', 'An arena operation is already running');
      arenaBusy = true;
      try {
        const { id, rounds = 1 } = await readBody(req);
        const cfg = loadConfig();
        let ledger;
        for (let i = 0; i < Math.min(Number(rounds) || 1, 10); i++) {
          ledger = await runDuel(id, cfg);
          if (ledger.status !== 'active') break;
        }
        return ok(res, { ledger });
      } finally {
        arenaBusy = false;
      }
    }
    if (url.pathname === '/api/arena/tasks' && req.method === 'PUT') {
      const { id, tasks } = await readBody(req);
      if (!loadLedger(id)) return fail(res, 404, 'NO_ARENA', 'No arena for this artifact');
      if (!Array.isArray(tasks) || !tasks.every((t) => typeof t?.prompt === 'string' && t.prompt.trim())) {
        return fail(res, 400, 'BAD_TASKS', 'tasks must be [{"prompt": "..."}, ...]');
      }
      saveTasks(id, tasks);
      return ok(res, { id, count: tasks.length });
    }
    if (url.pathname === '/api/arena/promote' && req.method === 'POST') {
      const { id, confirm } = await readBody(req);
      if (confirm !== true) return fail(res, 400, 'NO_CONFIRM', 'Promotion requires {"confirm": true}');
      const ledger = loadLedger(id);
      if (!ledger || ledger.status !== 'active') return fail(res, 404, 'NO_ARENA', 'No active arena for this artifact');
      promote(ledger, loadConfig(), { manual: true });
      return ok(res, { id, promoted: true, backup: ledger.promotion.backup });
    }
    if (url.pathname === '/api/arena/discard' && req.method === 'POST') {
      const { id, confirm } = await readBody(req);
      if (confirm !== true) return fail(res, 400, 'NO_CONFIRM', 'Discard requires {"confirm": true}');
      const ledger = loadLedger(id);
      if (!ledger || ledger.status !== 'active') return fail(res, 404, 'NO_ARENA', 'No active arena for this artifact');
      retireChallenger(ledger, { manual: true });
      return ok(res, { id, discarded: true });
    }

    // ---- static UI ----
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = join(UI_DIR, file);
    if (full.startsWith(UI_DIR + sep) && existsSync(full)) {
      res.writeHead(200, { 'Content-Type': MIME[extname(full)] ?? 'application/octet-stream' });
      return res.end(readFileSync(full));
    }
    return fail(res, 404, 'NOT_FOUND', 'Not found');
  } catch (e) {
    return fail(res, 500, 'INTERNAL', String(e.message ?? e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/?token=${TOKEN}`;
  // --open hands the tokenized URL straight to the browser, so the token never has
  // to pass through a terminal log or a chat transcript.
  if (process.argv.includes('--open')) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    const child = spawn(opener, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`could not launch a browser — open this URL yourself: ${url}`));
    child.unref();
    console.log(`eval-upgrade dashboard opened in your browser (http://127.0.0.1:${PORT}). Stop this process to shut it down.`);
    return;
  }
  console.log(`eval-upgrade dashboard → ${url}`);
  console.log('(the token is required for any mutating action; open the URL exactly as printed)');
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE'
    ? `Port ${PORT} is in use — a dashboard is probably already running. Stop it, or set EVAL_UPGRADE_PORT.`
    : `Dashboard failed to start: ${e.message}`);
  process.exit(1);
});
