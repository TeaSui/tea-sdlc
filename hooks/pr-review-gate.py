#!/usr/bin/env python3
"""PreToolUse gate for Bash: block `gh pr create` until a pre-PR review is recorded for HEAD.

The gate verifies that a review was recorded (scripts/mark-pr-review.py) with zero open findings.
It cannot verify review quality; rules/pre-pr-review.md owns that.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys

PR_CREATE = re.compile(r'(^|[;&|\s])gh\s+pr\s+create\b')
STATE_ROOT = pathlib.Path.home() / '.claude' / 'state' / 'pr-review'
PLUGIN_ROOT = pathlib.Path(__file__).resolve().parent.parent


def deny(reason):
    sys.stderr.write(reason + '\n')
    sys.exit(2)


def git(args, cwd):
    return subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True, timeout=30)


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        deny('pr-review-gate: unreadable hook input; blocking as a precaution.')

    if payload.get('tool_name') != 'Bash':
        sys.exit(0)
    command = (payload.get('tool_input') or {}).get('command', '')
    if not PR_CREATE.search(command):
        sys.exit(0)

    cwd = payload.get('cwd') or None
    top = git(['rev-parse', '--show-toplevel'], cwd)
    head = git(['rev-parse', 'HEAD'], cwd)
    if top.returncode or head.returncode:
        deny('pr-review-gate: not in a git repository with commits; cannot verify the pre-PR review.')

    repo_id = hashlib.sha256(top.stdout.strip().encode()).hexdigest()[:16]
    sha = head.stdout.strip()
    marker = STATE_ROOT / repo_id / f'{sha}.json'
    if not marker.is_file():
        deny(f'pr-review-gate: no pre-PR review recorded for HEAD {sha[:12]}. '
             f'Run {PLUGIN_ROOT}/rules/pre-pr-review.md, record it with '
             f'python3 "{PLUGIN_ROOT}/scripts/mark-pr-review.py", then retry.')

    try:
        record = json.loads(marker.read_text())
    except (OSError, ValueError):
        deny('pr-review-gate: review record is unreadable; re-record it.')

    open_findings = record.get('open_findings')
    if not isinstance(open_findings, int) or open_findings != 0:
        deny(f'pr-review-gate: review record lists {open_findings!r} open finding(s); '
             'fix or clear them, re-record, then retry.')
    sys.exit(0)


if __name__ == '__main__':
    main()
