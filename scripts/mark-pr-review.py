#!/usr/bin/env python3
"""Record a completed pre-PR review for the current HEAD, read by hooks/pr-review-gate.py.

Usage (from inside the repository under review):
  python3 "${CLAUDE_PLUGIN_ROOT}/scripts/mark-pr-review.py" --reviewer code-reviewer --open-findings 0 --note "pass 1, 3 fixed"
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import subprocess
import sys

STATE_ROOT = pathlib.Path.home() / '.claude' / 'state' / 'pr-review'


def git(args):
    return subprocess.run(['git', *args], capture_output=True, text=True, timeout=30)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reviewer', required=True)
    parser.add_argument('--open-findings', type=int, required=True)
    parser.add_argument('--note', default='')
    args = parser.parse_args()
    if args.open_findings < 0:
        sys.exit('open-findings must be >= 0')

    top = git(['rev-parse', '--show-toplevel'])
    head = git(['rev-parse', 'HEAD'])
    if top.returncode or head.returncode:
        sys.exit('not inside a git repository with commits')

    repo_id = hashlib.sha256(top.stdout.strip().encode()).hexdigest()[:16]
    sha = head.stdout.strip()
    record = {
        'head': sha,
        'reviewer': args.reviewer,
        'open_findings': args.open_findings,
        'note': args.note,
        'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    target = STATE_ROOT / repo_id / f'{sha}.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(record, indent=2) + '\n')
    print(f'recorded pre-PR review for {sha[:12]}: {target}')


if __name__ == '__main__':
    main()
