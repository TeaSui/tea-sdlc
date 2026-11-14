# Changelog

## 2.4.0 — 2026-11-14

### Added
- Three thinking-tool skills that trigger from the situation (no slash command needed) and remain callable by name:
  - `clarify` — inspect the project first, then ask only the questions whose answers change the work, each with the default that applies if unanswered.
  - `expert-lens` — what the field's best practitioner would notice, do first and refuse to do, with evidence per observation.
  - `reframe` — strongest case against the current view, its load-bearing assumption, a different framing and the cheapest check that settles it.
- The eval-upgrade tool is bundled at `tools/eval-upgrade/` (Node ≥ 20, zero dependencies). `/eval-upgrade` no longer needs `$EVAL_UPGRADE_HOME` or any external checkout. Results, proposals, arena ledgers and the optional `config.json` live in `~/.claude/state/eval-upgrade` (`$EVAL_UPGRADE_STATE_DIR` overrides), so they survive plugin updates.
- `hooks/hooks.json` registers the eval-upgrade auto-trigger (`PostToolUse`, async). It is inert unless `autoTrigger.enabled` is set in the state `config.json`.

### Changed
- eval-upgrade arena: the challenger is auto-promoted only if it reaches `arena.pointsToWin` (10) before the champion reaches `arena.pointsToDefend` (4). The previous symmetric first-to-10 race promoted a challenger of equal quality half the time; the new rule does so about 5% of the time.
- eval-upgrade: models are family aliases (`sonnet`, `opus`) instead of pinned ids; headless calls run without tools or skills so an installed copy of the asset under test cannot leak into a duel; the judge scores the answers rather than the instruction-file rubric; promotion and apply are confined to the directory that was evaluated, so `--target` arenas can promote; plugin-namespaced skill and agent names resolve in the auto-trigger; dashboard output is HTML-escaped and `server.mjs --open` passes the session token straight to the browser.
- `/prove-it` covers factual claims (root cause, code facts, external API facts) as well as completion claims, requires each check to be one that would fail if the claim were false, and reports `VERIFIED` / `NARROWED` / `REFUTED` / `UNVERIFIED` with the record corrected.
- `verification-before-completion` rewritten in the plugin's plain register (142 → 43 lines): same four-step gate and claim/evidence table, reasons in place of threats, plus explicit handling for checks that cannot run or that the user waived. A 72-session comparison on Sonnet and Haiku found no behavioral difference from the previous text; the change is for consistency and size.

## 2.3.1 — 2026-11-12

### Fixed
- `/prompt-builder` SDLC-flow prompt now matches `references/documentation-layout.md` and the service-docs commands: scoped paths (`<service>/docs/` or system root), read-layout-first and reuse of existing locations, single writer per spec file, `plan.md` for coordinated tiers, ADR ownership/numbering/immutability, fast-path living-doc update, implementers never edit specs/ADRs/living docs, and protected folders are never moved or deleted.

## 2.3.0 — 2026-11-12

### Changed
- `/generate-service-docs` and `/upgrade-service-docs` now ensure `<service>/docs/adr/` (and the system-root `docs/adr/`) exists, index ADRs in the service `README.md`, and report missing/candidate ADRs. ADR content is still owned by tech-lead-subagent and never written by these commands.
- `/prompt-builder` has an SDLC-flow track for software changes: generated prompts follow spec → adr → tdd → implement → test → create PR with a gate per stage. Non-software prompts keep the minimal/full tracks.

## 2.2.0 — 2026-11-12

### Added
- `references/sonar-way.md`: SonarQube "Sonar way" quality gate and code rules for implementation agents (backend, frontend, mobile, data, platform), referenced from their required reading and from `rules/patterns.md`.

## 2.1.0 — 2026-11-10

### Removed
- Vendored `building-with-the-claude-api` skill (3.2 MB, self-described as largely obsolete). Replaced by Claude Code's built-in `/claude-api` skill plus live sources (docs `.md` pages, `llms.txt`, docs MCP server, Context7) listed in `references/ai-integration-patterns.md`.

### Changed
- Model guidance is version-agnostic: agents use family aliases that resolve to the latest release; API code resolves the latest ID via the Models API (`line`, `lifecycle`) and pins it in config. `check-setup.py` rejects versioned IDs in agent frontmatter.

## 2.0.0 — 2026-11-10

### Breaking
- Subagents consolidated 17 → 12:
  - `devops-engineer-subagent` + `aws-infrastructure-subagent` → `platform-engineer-subagent`
  - `ai-engineer-subagent` → merged into `backend-engineer-subagent`
  - `growth-marketer-subagent` → merged into `business-analyst-subagent` (measurement mode, `measurement.md`)
  - `api-test-agent` → merged into `qa-subagent` (Phase 2b live API validation)
  - `agent-orchestrator` → skill `orchestrating-multi-domain-work`, run by the main session (no nested subagents)
- Project documentation paths unified under `references/documentation-layout.md`: change specs in `docs/specs/<feature>/`, ADRs in `docs/adr/`, living reference docs in `docs/*.md`. Role folders (`docs/requirements/`, `docs/security/`, `docs/contracts/`, `docs/design/`, `docs/domain/`) are read as legacy only.

### Changed
- Model/effort per agent follow `references/model-guide.md`: Opus for tech-lead, security and code review; Sonnet for implementers, BA, UI/UX and QA; Haiku for codebase mapping.
- `/generate-service-docs` and `/upgrade-service-docs` share the canonical layout, never touch `specs/`, `adr/`, `plans/` or legacy folders, and `/upgrade-service-docs` owns spec promotion.
- Bundled files are referenced via `${CLAUDE_PLUGIN_ROOT}` (agents, commands, skills) or plugin-root-relative paths (rules, references) instead of `~/.claude/`. Planning templates are bundled under `templates/planning/` and `references/planning/`.
- `scripts/check-setup.py` rewritten as the plugin validator (manifests, frontmatter, bundled references, SessionStart contract).
