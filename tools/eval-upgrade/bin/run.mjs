#!/usr/bin/env node
// CLI entry: node bin/run.mjs [--target <dir>] [--types skills,rules] [--llm] [--json]
//            node bin/run.mjs --show-config     effective config + where state lives
import { runEvaluation, loadConfig, resolveTarget } from '../lib/evaluate.mjs';
import { STATE_DIR, CONFIG_PATH, RESULTS_DIR, TOOL_ROOT } from '../lib/paths.mjs';
import { join } from 'node:path';
import { TYPES } from '../lib/scan.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const config = loadConfig();
if (flag('target')) config.target = flag('target');
if (flag('types')) {
  const wanted = flag('types').split(',').map((s) => s.trim());
  for (const t of TYPES) config.targets[t] = wanted.includes(t);
}
if (args.includes('--llm')) config.llmReview.enabled = true;

if (args.includes('--show-config')) {
  console.log(JSON.stringify({ stateDir: STATE_DIR, configFile: CONFIG_PATH, resolvedTarget: resolveTarget(config.target), config }, null, 2));
  process.exit(0);
}

if (!config.enabled) {
  console.error(`eval-upgrade is disabled (enabled: false in ${CONFIG_PATH}). Enable it there or via the dashboard.`);
  process.exit(2);
}

const results = await runEvaluation({
  config,
  onProgress: (msg) => { if (!args.includes('--json')) process.stderr.write(`  ${msg}\n`); },
});

if (args.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const { summary } = results;
  console.log(`\nTarget: ${results.target}`);
  console.log(`Artifacts: ${summary.evaluated} evaluated, ${summary.skipped} skipped (type toggled off)`);
  console.log(`Average score: ${summary.avgScore}/100\n`);
  for (const [type, s] of Object.entries(summary.byType)) {
    const state = s.enabled ? `${s.count} items, avg ${s.avgScore ?? '-'} — ${s.errors} errors, ${s.warnings} warnings` : 'OFF';
    console.log(`  ${type.padEnd(9)} ${state}`);
  }
  const worst = results.artifacts.filter((a) => !a.skipped && a.score < 100).sort((a, b) => a.score - b.score).slice(0, 10);
  if (worst.length) {
    console.log('\nLowest scores:');
    for (const a of worst) {
      console.log(`  ${String(a.score).padStart(3)}  ${a.id}`);
      for (const f of a.findings) console.log(`         [${f.severity}] ${f.message}`);
    }
  }
  console.log(`\nFull results: ${join(RESULTS_DIR, 'latest.json')}`);
  console.log(`Dashboard:    node ${join(TOOL_ROOT, 'server.mjs')} --open`);
}
