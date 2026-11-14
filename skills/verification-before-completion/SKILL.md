---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---

# Verification before completion

A completion claim is something the user acts on: they merge, deploy or move to the next task. Make the claim only when a check you can point to supports it, and say plainly when one does not.

## Before claiming a status

1. **Identify** the check that would show the claim is true, for the exact state and scope being claimed: commit/base or pending-file manifest, command, relevant environment or tool version.
2. **Reuse or run.** Reuse an earlier inspected result when that state and scope are unchanged and no failure or uncertainty has invalidated it, per `${CLAUDE_PLUGIN_ROOT}/rules/reduce-hallucinations.md`. Run the check again after relevant edits, dependency/config changes or new failures, or when the user asks for a fresh challenge such as `/prove-it`.
3. **Read** the decisive output: exit code, failure count, what was skipped. Redact sensitive values.
4. **Claim what the output supports**, with the evidence beside it. If the output does not support the claim, report the actual state instead.

## What supports a claim

| Claim | Supported by | Not supported by |
|-------|--------------|------------------|
| Tests pass | Test output for the checked state/scope: 0 failures | An invalidated earlier run; a targeted run presented as the whole suite |
| Linter clean | Linter output: 0 errors | A partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs that look fine |
| Bug fixed | The original symptom no longer reproduces | The code was changed |
| Regression test works | It failed before the fix and passes after | It passes once |
| Agent completed | The changed files/diff, cited evidence and exit-criteria results, read by you | The agent's own success report |
| Requirements met | A line-by-line check against the plan or spec | Tests passing |

## Scope the claim to the evidence

- A partial check supports a partial claim. Say what ran and what it covered.
- Distinguish PASS, FAIL, SKIPPED, UNSUPPORTED and static-only checks. Skipped tests are not passing tests, a parser does not prove runtime behavior, and a check that needs a missing service cannot be reported as passing.
- When a check cannot run (missing service, dependency or permission), or the user asked to skip it, say what was not verified and what that leaves open. "Changed, not verified" is a complete report; a guess presented as a result is not.
- "Should", "probably" and "seems to" mean the claim is ahead of the evidence. Run the check, or state the claim as unverified.
- For a regression test, cite the failing run seen before the fix. Only reverse a known owned patch in isolation; preserve a recoverable copy and never reset or delete user or other-agent work. See `test-driven-development` for safe recovery.

## Proportion

Match the check to the change. A prose typo needs a re-read, not the test suite; a change to shared behavior needs the whole suite, not one test. Apply this before any success claim, before committing or opening a PR when the claim depends on checks, and before moving to a dependent task or reporting a delegated task complete.

## Related

`grounding-claims` covers all factual claims (paths, symbols, APIs, commit SHAs); this skill covers success claims. Both put the evidence before the assertion.
