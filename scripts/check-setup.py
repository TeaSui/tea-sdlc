#!/usr/bin/env python3
"""Structural checks for the tea-sdlc plugin: manifests, frontmatter, bundled path
references and the SessionStart hook. No model, network or plugin-runtime calls."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

MODELS = {'haiku', 'sonnet', 'opus', 'fable', 'inherit'}
EFFORTS = {'low', 'medium', 'high', 'xhigh', 'max'}
BUNDLED_DIRS = ('rules', 'references', 'skills', 'templates', 'scripts', 'hooks', 'commands', 'agents', 'tools')
# Prose that the plugin authors and loads; vendored/synced skill docs are excluded.
SCANNED = ('agents', 'commands', 'rules', 'references', 'skills', 'hooks', 'scripts')
EXCLUDED = ('skills/synced/',)
# ~/.claude paths that legitimately belong to the user's install, not the plugin.
USER_PATHS = ('settings.json', 'CLAUDE.md', 'state/', 'projects/', 'agent-memory/')
BUNDLED_REF = re.compile(r'(?<![\w./~-])(\$\{CLAUDE_PLUGIN_ROOT\}/)?((?:%s)/[A-Za-z0-9_./-]+\.(?:md|py|sh|json|mjs))'
                         % '|'.join(BUNDLED_DIRS))
USER_REF = re.compile(r'~/\.claude/([A-Za-z0-9_./-]+)')
FRONTMATTER = re.compile(r'\A---\r?\n(.*?)\r?\n---', re.S)


def scanned_files(root):
    for directory in SCANNED:
        for path in (root / directory).rglob('*'):
            rel = path.relative_to(root).as_posix()
            if path.is_file() and path.suffix in {'.md', '.py', '.sh', ''} and not rel.startswith(EXCLUDED) \
                    and '__pycache__' not in rel:
                yield path, rel
    yield root / 'README.md', 'README.md'


def frontmatter(path):
    match = FRONTMATTER.match(path.read_text())
    return match.group(1) if match else None


def simple_fields(block):
    return {k.strip(): v.strip().strip('"\'') for k, v in
            (line.split(':', 1) for line in block.splitlines() if ':' in line and not line.startswith((' ', '-')))}


def yaml_errors(paths):
    ruby = shutil.which('ruby')
    if not ruby:
        return None
    script = r'''
require 'yaml'; require 'json'
errors = []
JSON.parse(STDIN.read).each do |path|
  begin
    m = File.read(path).match(/\A---\r?\n(.*?)\r?\n---/m)
    raise 'missing frontmatter' unless m
    data = YAML.safe_load(m[1])
    raise 'expected mapping' unless data.is_a?(Hash)
    raise 'skills must be a YAML list' if data.key?('skills') && !data['skills'].is_a?(Array)
  rescue => e
    errors << path + ': ' + e.message.lines.first.strip
  end
end
puts JSON.generate(errors)
'''
    result = subprocess.run([ruby, '-e', script], input=json.dumps([str(p) for p in paths]),
                            capture_output=True, text=True, timeout=30)
    return ['YAML diagnostics failed: exit %d' % result.returncode] if result.returncode else json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    root = parser.parse_args().root.resolve()
    errors, warnings = [], []

    # Manifests
    manifests = {}
    for name in ('plugin.json', 'marketplace.json'):
        try:
            manifests[name] = json.loads((root / '.claude-plugin' / name).read_text())
        except (OSError, ValueError) as error:
            errors.append('.claude-plugin/%s unreadable: %s' % (name, type(error).__name__))
    plugin = manifests.get('plugin.json', {})
    if plugin and not re.fullmatch(r'\d+\.\d+\.\d+', str(plugin.get('version', ''))):
        errors.append('plugin.json version must be semver')
    for entry in manifests.get('marketplace.json', {}).get('plugins', []):
        if 'version' in entry and entry['version'] != plugin.get('version'):
            errors.append('marketplace.json version differs from plugin.json')
    try:
        hooks = json.loads((root / 'hooks/hooks.json').read_text())
        for command in re.findall(r'\$\{CLAUDE_PLUGIN_ROOT\}/([^"\s]+)', json.dumps(hooks)):
            if not (root / command.replace('\\', '')).exists():
                errors.append('hooks.json references missing ' + command)
    except (OSError, ValueError) as error:
        errors.append('hooks/hooks.json unreadable: ' + type(error).__name__)

    # Frontmatter
    agents = sorted((root / 'agents').glob('*.md'))
    skills = sorted((root / 'skills').glob('*/SKILL.md'))
    commands = sorted((root / 'commands').glob('*.md'))
    for path in agents + skills + commands:
        block = frontmatter(path)
        rel = path.relative_to(root).as_posix()
        if block is None:
            errors.append(rel + ': missing frontmatter')
            continue
        fields = simple_fields(block)
        if 'description' not in fields:
            errors.append(rel + ': missing description')
        if path in agents + skills and 'name' not in fields:
            errors.append(rel + ': missing name')
        if path in agents:
            if fields.get('model') not in MODELS:
                errors.append(rel + ': model must be a family alias (latest release), got %r' % fields.get('model'))
            if fields.get('effort', 'high') not in EFFORTS:
                errors.append(rel + ': unsupported effort %r' % fields.get('effort'))
    parsed = yaml_errors(agents + skills + commands)
    if parsed is None:
        warnings.append('Ruby unavailable; full YAML parsing skipped.')
    else:
        errors.extend(e.replace(str(root) + '/', '') for e in parsed)

    # Path references
    checked = 0
    for path, rel in scanned_files(root):
        text = path.read_text(errors='replace')
        for match in USER_REF.finditer(text):
            target = match[1].rstrip('.')
            if not target.startswith(USER_PATHS):
                errors.append('%s: user-home path ~/.claude/%s — bundled files must be plugin-relative' % (rel, target))
        # ${CLAUDE_PLUGIN_ROOT} is substituted only in agent/command bodies and SKILL.md files.
        substituted = rel.startswith(('agents/', 'commands/')) or path.name == 'SKILL.md'
        if '${CLAUDE_PLUGIN_ROOT}' in text and not substituted and rel.endswith('.md') and rel != 'README.md':
            errors.append('%s: ${CLAUDE_PLUGIN_ROOT} is not substituted in Read-loaded files; use plugin-relative paths' % rel)
        for match in BUNDLED_REF.finditer(text):
            prefixed, target = bool(match[1]), match[2].rstrip('.')
            if re.search(r'[<>{}*]|YYYY|NNNN', target):
                continue
            checked += 1
            if prefixed:
                if not (root / target).exists():
                    errors.append('%s: ${CLAUDE_PLUGIN_ROOT}/%s does not exist at the plugin root' % (rel, target))
            elif not (root / target).exists() and not (path.parent / target).exists():
                errors.append('%s: missing bundled reference %s' % (rel, target))

    # SessionStart hook contract
    hook = root / 'hooks/session-start'
    try:
        result = subprocess.run(['/bin/bash', str(hook)], input='{}', capture_output=True, text=True, timeout=5, cwd=root)
        payload = json.loads(result.stdout)
        context = payload['hookSpecificOutput']
        if result.returncode or context['hookEventName'] != 'SessionStart' or not isinstance(context['additionalContext'], str):
            errors.append('SessionStart output contract failed.')
        if len(result.stdout.encode('utf-8')) > 49152:
            errors.append('SessionStart exceeded the 48 KiB output budget.')
        if 'systemMessage' in payload:
            warnings.append(payload['systemMessage'])
    except (ValueError, KeyError, OSError, subprocess.TimeoutExpired):
        errors.append('SessionStart could not emit valid bounded JSON within five seconds.')

    print(json.dumps({'status': 'PASS' if not errors else 'FAIL', 'version': plugin.get('version'),
                      'agents': len(agents), 'skills': len(skills), 'commands': len(commands),
                      'bundled_references_checked': checked,
                      'rules_bytes': sum(p.stat().st_size for p in (root / 'rules').glob('*.md')),
                      'errors': errors, 'warnings': warnings,
                      'limits': 'Structure only; no model/API run or behavioral review.'}, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
