# Pre-PR Self-Review

Before opening a PR, and before handing a change to review:

1. Run verification and show its output (see `references/agent-discipline.md` § Verification).
2. Review the diff in a fresh context, not in the implementation conversation:
   - Full workflow / orchestrator tiers: dispatch `code-reviewer` with the diff, the plan and contract paths, and `REVIEW.md` if present.
   - Fast-path tiers (no subagent dispatch): run the `code-review` skill once on the diff.
3. Fix each finding, or clear it with a stated reason backed by evidence. A note alone does not clear a finding.
4. Re-review only the diff added by those fixes.

Enforcement: the `gh pr create` PreToolUse gate (`hooks/pr-review-gate.py`) blocks unless a record exists for the current HEAD with zero open findings. Record it with `scripts/mark-pr-review.py --reviewer <name> --open-findings <n>`. The gate checks that the record exists and is current, not that the review was thorough; the reviewer owns that.

Limits: one pre-PR pass plus one diff-only re-review. Findings still open after that go to the human reviewer as explicit open items. Do not loop; see `rules/review-loop-limits.md`.
