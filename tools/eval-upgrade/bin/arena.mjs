#!/usr/bin/env node
// Arena CLI:
//   node bin/arena.mjs challenger <artifact-id>     register a challenger + task bank
//   node bin/arena.mjs duel <artifact-id> [N]       run N duel rounds (default 1)
//   node bin/arena.mjs status                       list active/archived arenas
//   node bin/arena.mjs promote <artifact-id>        manual promotion (skips threshold)
//   node bin/arena.mjs discard <artifact-id>        retire the challenger
import { loadConfig } from '../lib/evaluate.mjs';
import { registerChallenger, runDuel, arenaStatus, loadLedger, promote, retireChallenger } from '../lib/arena.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS_DIR, CONFIG_PATH } from '../lib/paths.mjs';

const [cmd, id, extra] = process.argv.slice(2);
const config = loadConfig();

if (!config.enabled) {
  console.error(`eval-upgrade is disabled (enabled: false in ${CONFIG_PATH}).`);
  process.exit(2);
}

/** The artifact and the target directory it was evaluated in, from the latest run. */
function artifactFromResults(artifactId) {
  const latest = join(RESULTS_DIR, 'latest.json');
  if (!existsSync(latest)) throw new Error('no evaluation results yet — run `node bin/run.mjs` first');
  const results = JSON.parse(readFileSync(latest, 'utf8'));
  const art = results.artifacts.find((a) => a.id === artifactId);
  if (!art) throw new Error(`artifact "${artifactId}" not found in the latest results (target: ${results.target}) — re-run the evaluation for the right --target`);
  if (art.skipped) throw new Error(`artifact "${artifactId}" was skipped in the latest run (its type was off) — re-run the evaluation including it`);
  return { art, target: results.target };
}

function printLedger(l) {
  console.log(`\n${l.id} [${l.status}] — champion ${l.points.champion} : ${l.points.challenger} challenger (challenger needs ${l.pointsToWin} before champion reaches ${l.pointsToDefend ?? l.pointsToWin})`);
  for (const d of l.duels.slice(-5)) console.log(`  ${d.at}  winner=${d.winner}  ${d.reasoning}`);
  if (l.promotion) console.log(`  PROMOTED at ${l.promotion.at} — backup: ${l.promotion.backup}`);
}

try {
  switch (cmd) {
    case 'challenger': {
      const { art, target } = artifactFromResults(id);
      const ledger = await registerChallenger(art, config, target);
      console.log(`Challenger registered for ${id} (model: ${config.upgrade.model}).`);
      printLedger(ledger);
      break;
    }
    case 'duel': {
      const rounds = Number(extra ?? 1);
      if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`rounds must be a positive integer, got "${extra}"`);
      let ledger;
      for (let i = 0; i < rounds; i++) {
        ledger = await runDuel(id, config);
        const last = ledger.duels.at(-1);
        console.log(`round ${i + 1}/${rounds}: winner=${last.winner} (${ledger.points.champion}:${ledger.points.challenger})`);
        if (ledger.status !== 'active') break;
      }
      printLedger(ledger);
      break;
    }
    case 'status': {
      const rows = arenaStatus();
      if (!rows.length) console.log('No arenas yet. Start one: node bin/arena.mjs challenger <artifact-id>');
      for (const r of rows) console.log(`${r.id.padEnd(40)} ${r.status.padEnd(9)} ${r.points.champion}:${r.points.challenger} (${r.duels} duels, challenger to ${r.pointsToWin} / champion to ${r.pointsToDefend})`);
      break;
    }
    case 'promote': {
      const ledger = loadLedger(id);
      if (!ledger) throw new Error(`no active arena for "${id}"`);
      promote(ledger, config, { manual: true });
      console.log(`Promoted challenger for ${id}. Backup: ${ledger.promotion.backup}`);
      break;
    }
    case 'discard': {
      const ledger = loadLedger(id);
      if (!ledger) throw new Error(`no active arena for "${id}"`);
      retireChallenger(ledger, { manual: true });
      console.log(`Discarded challenger for ${id}.`);
      break;
    }
    default:
      console.log('Usage: node bin/arena.mjs <challenger|duel|status|promote|discard> [artifact-id] [rounds]');
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
