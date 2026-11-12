# SonarQube "Sonar way" — Implementation Rules

Shared by every implementation agent (`backend`, `frontend`, `mobile`, `data`, `platform`). Write code that passes SonarQube's built-in **Sonar way** quality gate and quality profile on the first scan, so `code-reviewer` and CI do not bounce it.

**Authority order:** the project's own `sonar-project.properties`, custom quality gate/profile, `// NOSONAR` conventions and CI config override this file. Rule keys and thresholds below are illustrative names, not a complete list — the SonarQube server (or SonarLint) is the source of truth. Do not copy the profile's rule list into project docs.

## Quality gate (new code)

Sonar way gates on **new code**, so hold every change to it:

| Condition | Required |
|---|---|
| Reliability / Security / Maintainability rating | A (no new bugs, vulnerabilities, or blocker/high-severity smells) |
| Security hotspots reviewed | 100% — flag each one to the dispatcher, never silently dismiss |
| Coverage on new code | ≥ 80% (tests come from the TDD step, not added afterwards) |
| Duplicated lines on new code | ≤ 3% |

## Code rules to follow while writing

| Rule | Do |
|---|---|
| S3776 cognitive complexity | Keep each function ≤ 15 (the Sonar way default). Use early returns, guard clauses and extracted helpers instead of nesting. |
| S1066 / S3358 | Merge collapsible `if`s; no nested ternaries. |
| S107 parameters | ≤ 7 per function; group related ones into an object/DTO. |
| S1192 duplicated literals | A string used 3+ times becomes a named constant. |
| S4144 duplicated functions | Extract shared bodies rather than copy them. |
| S1481 / S1854 / S1172 | No unused locals, dead stores or unused parameters. |
| S125 commented-out code | Delete it; git keeps history. |
| S108 / S1186 empty blocks | Never leave an empty block or method; add the intent or remove it. |
| S1135 TODO tags | Do not leave `TODO`/`FIXME` in committed code; track the work in the plan or issue tracker. |
| S2068 hardcoded credentials | Secrets come from env/secret store (see `rules/security.md`). |
| S2259 null dereference | Handle null/undefined/`None` explicitly at the point it can occur. |
| S2095 resources | Close streams, connections and files (try-with-resources, `defer`, `with`, `using`). |

Language specifics (Java/Kotlin, JS/TS, Python, Go, C#, Swift, Terraform, Dockerfile, …) come from the project's active profile; fetch exact rule text with Context7 or the SonarQube rule page rather than guessing.

## Verification

1. If a scanner or SonarLint config exists (`sonar-project.properties`, CI `sonar` step, IDE binding), run the project's documented scan command and fix new issues before returning. Do not install or configure a SonarQube server unprompted.
2. If no scanner is available, self-review the diff against the tables above and say so in the return: `Sonar way: self-reviewed, scan not run`.
3. Never suppress an issue (`NOSONAR`, `@SuppressWarnings`, `eslint-disable`) to make the gate pass. If a rule is a genuine false positive, report it with the rule key and `path:line` and let the dispatcher decide.
4. Do not refactor untouched code to satisfy rules; the gate applies to new code only. Report notable legacy findings, do not fix them in scope.
