# Changelog

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
