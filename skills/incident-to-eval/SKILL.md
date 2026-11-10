---
name: incident-to-eval
description: Turn a revert, rollback or production incident caused by a merged change into a regression case for review quality. Use when a commit is reverted, a rollback happens, or the user asks to add an incident to the review eval set.
---

# Incident to eval

1. Identify the change: PR or commit, the defect, and when it was introduced.
2. Record why review missed it: not caught by tests, absent from `REVIEW.md`, or misread by the reviewer. If unknown, say so.
3. Add one case to the project's review eval location (for example `evals/review/`, following that repository's test conventions). Input is the offending diff or a minimal fixture; expected is the finding or a pass. Redact PII, credentials and raw request bodies (`${CLAUDE_PLUGIN_ROOT}/references/data-privacy-patterns.md`).
4. Close the gap: the reviewer prompt, `REVIEW.md`, or a test.
5. Run the full case set and compare with the previous baseline. A reviewer, prompt or tool change must not lower the pass rate.
6. Report the case path, baseline and new pass rates, and the path of the command output.

Scope: review quality on product code. Agent and command asset quality is measured by `/eval-upgrade`.
