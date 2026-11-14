// Optional LLM-backed review and upgrade-proposal generation via the `claude` CLI.
// Both functions degrade gracefully when the CLI is missing — the static checks
// never depend on this module succeeding.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const TIMEOUT_MS = 180_000;

// Test mode: EVAL_UPGRADE_FAKE_LLM=1 stubs every claude call with a deterministic
// canned response so the full pipeline (review, upgrade, arena duels, promotion)
// can be exercised without spending tokens. Real runs are identical code paths.
const FAKE = process.env.EVAL_UPGRADE_FAKE_LLM === '1';
let fakeCounter = 0;

/** Un-queued spawn — used by the arena to run duel variants in parallel (max 2). */
export function runClaudeRaw(prompt, model) {
  if (FAKE) {
    fakeCounter++;
    if (/"winner"/.test(prompt)) {
      // mostly-challenger judge so both accumulation and promotion paths get exercised
      return Promise.resolve({ ok: true, output: `{"winner": ${fakeCounter % 3 === 0 ? 1 : 2}, "reasoning": "fake judge verdict"}` });
    }
    if (/ONLY a JSON array/.test(prompt)) {
      return Promise.resolve({ ok: true, output: '[{"prompt":"Fake task 1: apply the instructions to scenario A"},{"prompt":"Fake task 2: apply the instructions to scenario B"}]' });
    }
    if (/ONLY a JSON object/.test(prompt)) {
      return Promise.resolve({ ok: true, output: '{"score": 88, "summary": "fake review", "suggestions": ["fake suggestion"]}' });
    }
    return Promise.resolve({ ok: true, output: `FAKE-LLM-OUTPUT #${fakeCounter}\n(prompt was ${prompt.length} chars)` });
  }
  return new Promise((resolve) => {
    // cwd is a neutral temp dir so the spawned CLI does not load the project
    // CLAUDE.md / session hooks of the very repo being evaluated.
    // No tools, no skills/commands: every call here is one text-in, text-out turn.
    // Without this the spawned session can load the installed copy of the very skill
    // under test, so champion and challenger would both run the champion.
    // The env flag stops the auto-trigger hook from starting a duel inside a duel.
    const child = spawn('claude', ['-p', '--model', model, '--tools', '', '--disable-slash-commands', '--no-session-persistence'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
      cwd: tmpdir(),
      env: { ...process.env, EVAL_UPGRADE_AUTO_TRIGGER_ACTIVE: '1' },
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => resolve({ ok: false, error: `claude CLI unavailable: ${e.message}` }));
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, output: out.trim() });
      else resolve({ ok: false, error: `claude exited ${code}: ${err.slice(0, 300)}` });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Serialize all claude spawns from review/upgrade paths: N dashboard clicks must
// not fork N concurrent CLI processes. Each call chains onto the previous one.
let queue = Promise.resolve();

function runClaude(prompt, model) {
  const task = () => runClaudeRaw(prompt, model);
  const result = queue.then(task, task);
  queue = result.then(() => {}, () => {});
  return result;
}

export const RUBRIC = {
  skills: 'progressive disclosure (metadata → body → resources), imperative instructions, explains WHY not just MUST, trigger-rich description, no harmful duplication of rule files (pointers instead)',
  agents: 'single clear responsibility, dispatch examples in description, scoped tools, consumes dispatch-prompt-contract inputs, returns status/evidence/exit-criteria',
  commands: 'clear one-purpose slash command, frontmatter description, concrete steps',
  rules: 'single source of truth (pointers over copies), enforceable statements, no drift-prone duplicated lists',
};

export async function llmReview(art, model) {
  let content;
  try { content = readFileSync(art.path, 'utf8'); } catch { return null; }
  const prompt = `You are auditing a Claude Code ${art.type} definition file. Quality criteria: ${RUBRIC[art.type] ?? 'clarity, correctness, maintainability'}.

Respond with ONLY a JSON object: {"score": <0-100>, "summary": "<one sentence overall>", "suggestions": ["<specific improvement>", ...max 5]}

FILE (${art.relPath}):
${content.slice(0, 30_000)}`;
  const res = await runClaude(prompt, model);
  if (!res.ok) return { error: res.error };
  try {
    const json = JSON.parse(res.output.replace(/^```(?:json)?\n?|\n?```$/g, ''));
    return { score: json.score, summary: json.summary, suggestions: json.suggestions ?? [] };
  } catch {
    return { error: 'unparseable LLM response', raw: res.output.slice(0, 500) };
  }
}

export async function generateUpgrade(art, findings, model) {
  let content;
  try { content = readFileSync(art.path, 'utf8'); } catch (e) { return { ok: false, error: e.message }; }
  const findingLines = findings.map((f) => `- [${f.severity}] ${f.message}`).join('\n') || '- (no static findings; do a general quality pass)';
  const prompt = `You are upgrading a Claude Code ${art.type} definition file. Quality criteria: ${RUBRIC[art.type] ?? 'clarity, correctness, maintainability'}.

Known issues from static analysis:
${findingLines}

Rules:
- Preserve the artifact's name, purpose, and triggering intent. Improve, don't reinvent.
- Fix every listed issue that is actually valid; ignore false positives silently.
- Keep or improve brevity; do not pad.
- Output ONLY the complete improved file content. No preamble, no code fences, no commentary.

CURRENT FILE (${art.relPath}):
${content.slice(0, 60_000)}`;
  const res = await runClaude(prompt, model);
  if (!res.ok) return { ok: false, error: res.error };
  let out = res.output;
  // strip accidental fencing
  out = out.replace(/^```[a-z]*\n/, '').replace(/\n```\s*$/, '');
  return { ok: true, content: out };
}
