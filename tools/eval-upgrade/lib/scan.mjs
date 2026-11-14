// Discover Claude Code assets (agents, commands, rules, skills) in a .claude directory.
// Hooks are deliberately out of scope: they are executable code, not instruction files.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

export const TYPES = ['agents', 'commands', 'rules', 'skills'];

/**
 * @param {string} claudeDir absolute path to a .claude directory
 * @returns {Array<{id:string,type:string,path:string,relPath:string,name:string}>}
 */
export function scan(claudeDir) {
  const artifacts = [];

  const mdDir = (type) => {
    const dir = join(claudeDir, type);
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (!statSync(p).isFile() || !f.endsWith('.md')) continue;
      const name = basename(f, '.md');
      artifacts.push({ id: `${type}/${name}`, type, path: p, relPath: `${type}/${f}`, name });
    }
  };

  mdDir('agents');
  mdDir('commands');
  mdDir('rules');

  const skillsDir = join(claudeDir, 'skills');
  if (existsSync(skillsDir)) {
    for (const d of readdirSync(skillsDir).sort()) {
      const skillMd = join(skillsDir, d, 'SKILL.md');
      if (existsSync(skillMd) && statSync(skillMd).isFile()) {
        artifacts.push({
          id: `skills/${d}`, type: 'skills', path: skillMd,
          relPath: `skills/${d}/SKILL.md`, name: d,
        });
      }
    }
  }

  return artifacts;
}
