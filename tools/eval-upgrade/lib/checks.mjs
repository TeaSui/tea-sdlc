// Static quality checks for Claude Code assets. Each check pushes findings:
// { severity: 'error'|'warn'|'info', code, message }
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SIZE_BUDGET_LINES = { skills: 500, agents: 400, rules: 350, commands: 300 };
const HARD_LINE_CAP = 1500;

export function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(4, end);
  const fm = {};
  let currentKey = null;
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (m) {
      currentKey = m[1];
      fm[currentKey] = m[2].replace(/^[>|][-+]?\s*$/, '').trim();
    } else if (currentKey && /^\s+\S/.test(line)) {
      fm[currentKey] = (fm[currentKey] ? fm[currentKey] + ' ' : '') + line.trim();
    }
  }
  return fm;
}

function stripCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

function gitAgeDays(path) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], {
      cwd: join(path, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!out) return null;
    return Math.floor((Date.now() / 1000 - Number(out)) / 86400);
  } catch {
    return null;
  }
}

/** Check that in-prose references to .claude assets resolve. Fenced code is skipped
 *  because rule files legitimately contain example paths in code blocks. A ref is only
 *  flagged when it resolves against NONE of the plausible bases (this .claude dir, its
 *  parent repo, the user-level ~/.claude, the artifact's own directory). */
function checkAssetRefs(art, text, claudeDir, findings) {
  const prose = stripCodeFences(text);
  const refRe = /\b(rules|references|agents|commands)\/[A-Za-z0-9_\-./]+?\.(?:md|sh|json|ya?ml)\b|\bskills\/[a-z0-9-]+(?:\/[A-Za-z0-9_\-./]+?\.(?:md|py|sh|json))?\b/g;
  const home = process.env.HOME ?? '';
  const bases = [claudeDir, join(claudeDir, '..'), join(home, '.claude'), join(art.path, '..')];
  const seen = new Set();
  for (const m of prose.matchAll(refRe)) {
    const ref = m[0].replace(/[.,;:]$/, '');
    if (seen.has(ref)) continue;
    seen.add(ref);
    const candidates = bases.map((b) => join(b, ref));
    // bare `skills/<name>` refers to a skill directory
    if (/^skills\/[a-z0-9-]+$/.test(ref)) candidates.push(...bases.map((b) => join(b, ref, 'SKILL.md')));
    if (!candidates.some((c) => existsSync(c))) {
      findings.push({ severity: 'warn', code: 'broken-ref', message: `References "${ref}" which does not exist` });
    }
  }
}

function commonMarkdownChecks(art, text, claudeDir, findings) {
  const lines = text.split('\n').length;
  const budget = SIZE_BUDGET_LINES[art.type] ?? 500;
  if (lines > HARD_LINE_CAP) {
    findings.push({ severity: 'error', code: 'size-cap', message: `${lines} lines exceeds hard cap of ${HARD_LINE_CAP} — split into references/` });
  } else if (lines > budget) {
    findings.push({ severity: 'warn', code: 'size-budget', message: `${lines} lines exceeds the ${budget}-line budget for ${art.type}` });
  }

  // Only marker-style usage (with a colon) counts — prose that merely talks about
  // TODOs ("no TODO, no stub") is not a draft marker.
  const todos = (stripCodeFences(text).match(/\b(TODO|FIXME|TBD|XXX):/g) || []).length;
  if (todos > 0) {
    findings.push({ severity: 'warn', code: 'placeholders', message: `${todos} TODO:/FIXME: marker(s) — instruction files should be finished, not drafts` });
  }

  checkAssetRefs(art, text, claudeDir, findings);
  return lines;
}

function descriptionChecks(fm, { min = 30, wantTriggers = false } = {}, findings) {
  const desc = fm?.description ?? '';
  if (!desc) {
    findings.push({ severity: 'error', code: 'no-description', message: 'Missing frontmatter description — the primary triggering mechanism' });
    return;
  }
  if (desc.length < min) {
    findings.push({ severity: 'warn', code: 'thin-description', message: `Description is ${desc.length} chars — too thin to trigger reliably` });
  }
  if (wantTriggers && !/use (this |it )?(when|whenever|before|after)|triggers? on|activate|should be used/i.test(desc)) {
    findings.push({ severity: 'warn', code: 'no-trigger-guidance', message: 'Description lacks "use when / triggers on" phrasing — undertriggering risk' });
  }
}

export function evaluateArtifact(art, claudeDir, opts = {}) {
  const findings = [];
  let text = '';
  try {
    text = readFileSync(art.path, 'utf8');
  } catch (e) {
    return { findings: [{ severity: 'error', code: 'unreadable', message: String(e.message) }], lines: 0, ageDays: null };
  }

  let lines = text.split('\n').length;
  const ageDays = opts.skipGit ? null : gitAgeDays(art.path);
  if (ageDays !== null && ageDays > 180) {
    findings.push({ severity: 'info', code: 'stale', message: `Last commit touching this file was ${ageDays} days ago — verify it still reflects reality` });
  }

  switch (art.type) {
    case 'skills': {
      const fm = parseFrontmatter(text);
      if (!fm) findings.push({ severity: 'error', code: 'no-frontmatter', message: 'SKILL.md must start with YAML frontmatter (name, description)' });
      else {
        if ((fm.name ?? '') !== art.name) {
          findings.push({ severity: 'warn', code: 'name-mismatch', message: `frontmatter name "${fm.name ?? ''}" does not match directory "${art.name}"` });
        }
        descriptionChecks(fm, { min: 60, wantTriggers: true }, findings);
      }
      lines = commonMarkdownChecks(art, text, claudeDir, findings);
      // referenced bundled resources must exist
      const skillDir = join(art.path, '..');
      for (const m of stripCodeFences(text).matchAll(/\b(references|scripts|assets|agents|evals)\/[A-Za-z0-9_\-./]+\.\w+/g)) {
        if (!existsSync(join(skillDir, m[0]))) {
          findings.push({ severity: 'warn', code: 'missing-resource', message: `Bundled resource "${m[0]}" not found in skill directory` });
        }
      }
      break;
    }
    case 'agents': {
      const fm = parseFrontmatter(text);
      if (!fm) findings.push({ severity: 'error', code: 'no-frontmatter', message: 'Agent definition needs YAML frontmatter (name, description)' });
      else {
        if (!fm.name) findings.push({ severity: 'error', code: 'no-name', message: 'Missing frontmatter name' });
        descriptionChecks(fm, { min: 60 }, findings);
        if (fm.description && !/<example>/i.test(fm.description)) {
          findings.push({ severity: 'info', code: 'no-examples', message: 'Description has no <example> blocks — examples improve dispatch accuracy' });
        }
        if (!fm.tools) findings.push({ severity: 'info', code: 'no-tools', message: 'No tools field — agent inherits all tools; scope it if it should be restricted' });
      }
      lines = commonMarkdownChecks(art, text, claudeDir, findings);
      break;
    }
    case 'commands': {
      const fm = parseFrontmatter(text);
      if (!fm?.description) {
        findings.push({ severity: 'warn', code: 'no-description', message: 'No frontmatter description — command list shows nothing useful for /help' });
      }
      lines = commonMarkdownChecks(art, text, claudeDir, findings);
      break;
    }
    case 'rules': {
      if (!/^#\s+\S/m.test(text)) {
        findings.push({ severity: 'warn', code: 'no-title', message: 'Rule file has no H1 title' });
      }
      lines = commonMarkdownChecks(art, text, claudeDir, findings);
      break;
    }
  }

  return { findings, lines, ageDays };
}

// Scoring formula (published so it can't Goodhart silently):
//   score = 100 - 25*errors - 8*warnings. info findings NEVER affect the score —
//   they are observations (staleness, missing examples), not defects. A file with
//   zero errors can never drop below 60, so style noise can't bury a healthy artifact.
export function scoreFindings(findings) {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  let score = 100 - 25 * errors - 8 * warns;
  if (errors === 0) score = Math.max(60, score);
  return Math.max(0, score);
}
