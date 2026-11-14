// Orchestrates a full evaluation run: scan → per-artifact checks → scores → persisted results.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { STATE_DIR, CONFIG_PATH, RESULTS_DIR, PROPOSALS_DIR } from './paths.mjs';
import { scan, TYPES } from './scan.mjs';
import { evaluateArtifact, scoreFindings } from './checks.mjs';
import { llmReview } from './llm.mjs';

export { CONFIG_PATH, RESULTS_DIR, PROPOSALS_DIR };

// Defaults are the whole configuration: the state directory's config.json is
// optional and only needs the keys the user changed. Models are family aliases
// (the `claude` CLI resolves them to the newest release), never pinned ids —
// a pinned id goes stale and then every LLM call fails.
export const DEFAULT_CONFIG = {
  enabled: true,
  target: '~/.claude',
  targets: { agents: true, commands: true, rules: true, skills: true },
  llmReview: { enabled: false, model: 'sonnet', maxArtifacts: 10 },
  upgrade: { model: 'opus' },
  // The challenger must reach pointsToWin before the champion reaches pointsToDefend.
  // 10 vs 4 means a challenger that is no better than the champion is promoted about
  // 5% of the time; a symmetric first-to-10 race would promote it 50% of the time.
  arena: { pointsToWin: 10, pointsToDefend: 4, executorModel: 'sonnet', judgeModel: 'opus', tasksPerArtifact: 4 },
  // Off by default: this fires background claude -p duels from real session usage
  // (via the PostToolUse hook) and spends real tokens without an explicit CLI/UI click.
  autoTrigger: { enabled: false, action: 'duel', throttle: 'day', roundsPerFire: 1 },
};

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return structuredClone(DEFAULT_CONFIG);
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return {
      ...structuredClone(DEFAULT_CONFIG), ...cfg,
      targets: { ...DEFAULT_CONFIG.targets, ...cfg.targets },
      llmReview: { ...DEFAULT_CONFIG.llmReview, ...cfg.llmReview },
      upgrade: { ...DEFAULT_CONFIG.upgrade, ...cfg.upgrade },
      arena: { ...DEFAULT_CONFIG.arena, ...cfg.arena },
      autoTrigger: { ...DEFAULT_CONFIG.autoTrigger, ...cfg.autoTrigger },
    };
  } catch (e) {
    throw new Error(`config.json is invalid JSON: ${e.message}`);
  }
}

export function saveConfig(cfg) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}

/** Absolute path: ledgers and results store it, and later runs start from another cwd. */
export function resolveTarget(target) {
  return resolve(target.replace(/^~(?=\/|$)/, homedir()));
}

/**
 * @returns full results object (also persisted to results/latest.json + timestamped history)
 */
export async function runEvaluation({ config = loadConfig(), onProgress = () => {} } = {}) {
  if (!config.enabled) {
    return { generatedAt: new Date().toISOString(), disabled: true, summary: null, artifacts: [] };
  }
  const claudeDir = resolveTarget(config.target);
  if (!existsSync(claudeDir)) throw new Error(`Target directory not found: ${claudeDir}`);

  const enabledTypes = TYPES.filter((t) => config.targets[t]);
  const all = scan(claudeDir);
  const artifacts = [];
  let llmBudget = config.llmReview.enabled ? config.llmReview.maxArtifacts : 0;

  for (const art of all) {
    if (!enabledTypes.includes(art.type)) {
      artifacts.push({ ...art, skipped: true, score: null, findings: [], llm: null });
      continue;
    }
    onProgress(`checking ${art.id}`);
    const { findings, lines, ageDays } = evaluateArtifact(art, claudeDir);
    let contentHash = null;
    try { contentHash = createHash('sha256').update(readFileSync(art.path)).digest('hex'); } catch { /* unreadable already reported */ }
    const entry = { ...art, skipped: false, lines, ageDays, contentHash, findings, score: scoreFindings(findings), llm: null };
    if (llmBudget > 0 && entry.score < 100) {
      llmBudget--;
      onProgress(`LLM review ${art.id}`);
      entry.llm = await llmReview(art, config.llmReview.model);
    }
    artifacts.push(entry);
  }

  const evaluated = artifacts.filter((a) => !a.skipped);
  const byType = {};
  for (const t of TYPES) {
    const items = evaluated.filter((a) => a.type === t);
    byType[t] = {
      enabled: config.targets[t],
      count: items.length,
      avgScore: items.length ? Math.round(items.reduce((s, a) => s + a.score, 0) / items.length) : null,
      errors: items.reduce((s, a) => s + a.findings.filter((f) => f.severity === 'error').length, 0),
      warnings: items.reduce((s, a) => s + a.findings.filter((f) => f.severity === 'warn').length, 0),
    };
  }

  const results = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: claudeDir,
    configSnapshot: config,
    summary: {
      total: all.length,
      evaluated: evaluated.length,
      skipped: all.length - evaluated.length,
      avgScore: evaluated.length ? Math.round(evaluated.reduce((s, a) => s + a.score, 0) / evaluated.length) : null,
      byType,
    },
    artifacts,
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = results.generatedAt.replace(/[:.]/g, '-');
  writeFileSync(join(RESULTS_DIR, `run-${stamp}.json`), JSON.stringify(results, null, 2));
  writeFileSync(join(RESULTS_DIR, 'latest.json'), JSON.stringify(results, null, 2));
  return results;
}
