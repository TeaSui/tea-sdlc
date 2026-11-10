# Agent Discipline (Shared)

All implementation agents follow these rules. Domain-specific test commands stay in each agent definition.

## TDD

No production code without a failing test first. RED (one failing test) → GREEN (simplest code to pass) → REFACTOR. Minimum 80% coverage on changed code. Mock only external HTTP APIs; use real DB/in-memory for data layer tests.

## Debugging

No fixes without root cause investigation. Read errors → reproduce → check git diff → trace data flow → form ONE hypothesis → test smallest change. If 2 fix attempts fail on the same issue → STOP and escalate.

## Verification

No completion claims without running tests and build. Show actual command output: test count, pass/fail, coverage %, build exit code. Forbidden phrases: "should work", "probably passes", "looks good", "I'm confident" — without actual output to back them up.

Write test output to a file (e.g., `test-results.txt`) and confirm with Read tool. A file on disk requires actually running the command.

## Escalation Triggers

- 2 failed fixes on the same issue
- Reading >10 files without producing code
- >3 consecutive build/test errors

When escalating, report: what you tried, errors seen, root cause guess, what would unblock you.

## Project Context

**Path convention:** in tea-sdlc files, paths beginning `rules/`, `references/`, `skills/` or `templates/` are relative to the tea-sdlc plugin root (the parent directory of this `references/` folder), never to the target project or `~/.claude/`. Project paths such as `docs/…` are relative to the target project.

Follow the target project's documented stack, architecture, environment, security constraints and output locations, within the dispatch's owned scope. Treat personal stack and region choices in agent definitions as defaults only when the project leaves the choice open; do not migrate an established stack as part of unrelated work.

## Factual Grounding

Follow `rules/reduce-hallucinations.md`: never invent file paths, function names, CLI flags, library APIs, or commit SHAs. Every load-bearing claim must cite a source you verified this session (`path:line`, command output, or context7 doc) — otherwise say "I don't know". Evidence paths in your return must exist; fabricated paths are treated as BLOCKED by the dispatcher.

## Conditional Agent Memory

If the runtime provides an enabled persistent memory directory in the configured scope, this task authorizes memory writes there, and your existing tools permit them, record concise, dated, project-scoped findings without secrets or personal data. Otherwise return relevant learnings to the caller without claiming persistence. Do not enable memory, invent a path, add tools or delegate memory writes to bypass your role. Memory permission never authorizes additional implementation edits. Each agent's definition lists domain-specific examples of what to persist.
