#!/usr/bin/env python3
"""PreToolUse gate for Bash: block git commit/push unless gitleaks reports no secrets.

Fails closed: missing gitleaks, scanner errors, or unreadable hook input block the command.
Limitation: commit scans staged content only, so `git commit -a` is not covered; CI is the backstop.
"""
import json
import re
import shutil
import subprocess
import sys

GIT_WRITE = re.compile(r'(^|[;&|\s])git\s+(commit|push)\b')
GIT_PUSH = re.compile(r'(^|[;&|\s])git\s+push\b')


def deny(reason):
    sys.stderr.write(reason + '\n')
    sys.exit(2)


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        deny('security-gate: unreadable hook input; blocking as a precaution.')

    if payload.get('tool_name') != 'Bash':
        sys.exit(0)
    command = (payload.get('tool_input') or {}).get('command', '')
    if not GIT_WRITE.search(command):
        sys.exit(0)

    if shutil.which('gitleaks') is None:
        deny('security-gate: gitleaks is not installed, so git commit/push is blocked. Install gitleaks and retry.')

    if GIT_PUSH.search(command):
        args = ['gitleaks', 'git', '--redact', '--no-banner', '--log-opts=@{u}..HEAD']
    else:
        args = ['gitleaks', 'git', '--pre-commit', '--staged', '--redact', '--no-banner']

    try:
        result = subprocess.run(args, cwd=payload.get('cwd') or None,
                                capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired) as error:
        deny(f'security-gate: gitleaks could not complete ({type(error).__name__}); blocking.')

    if result.returncode == 0:
        sys.exit(0)
    if result.returncode == 1:
        deny('security-gate: gitleaks found a potential secret; remove it and retry.\n'
             + result.stdout[-2000:])
    deny(f'security-gate: gitleaks exited {result.returncode}; blocking.\n' + result.stderr[-1000:])


if __name__ == '__main__':
    main()
