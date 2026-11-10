# Documentation Layout (single source of truth)

This file owns **where project documentation lives, who writes each file, and how a document moves through its lifecycle**. Agents, commands, skills and rules point here and do not restate the tree. If another tea-sdlc file disagrees with this one, this file wins — fix the other file.

Paths to tea-sdlc files (`rules/…`, `references/…`) in this file are relative to the plugin root (the parent of this `references/` folder). Documentation paths are **target-project** paths relative to the owning scope root (§6.1), never relative to the plugin.

## 1. Principle: separate by lifecycle, not by author

| Kind | Answers | Mutability | Location | Prior art |
|---|---|---|---|---|
| **Living reference** | What does the system do *now*? | Rewritten to match verified code | `docs/*.md` (fixed set, §2/§3) | arc42 + C4, Diátaxis reference/explanation |
| **Change spec** | What are we changing, and why? | Edited while `proposed`/`accepted`; frozen once `implemented` | `docs/specs/<feature>/` | GitHub Spec Kit `specs/<feature>/`, Kiro `.kiro/specs/<feature>/` |
| **Decision record** | Why X over Y? | Immutable once accepted; superseded, never rewritten | `docs/adr/NNNN-<decision>.md` | Nygard ADR, MADR |
| **Workflow state** | How do we execute, where are we? | Disposable | `docs/specs/<feature>/plan.md`, `docs/plans/`, `.planning/` | Spec Kit `plan.md`/`tasks.md`, GSD `.planning/` |

Role-based trees (`docs/requirements/`, `docs/security/`, `docs/contracts/`, `docs/design/`, `docs/domain/`) are **not used for new work**: they scatter one change across five folders and never say whether content is intent or fact. Projects that already use them keep them (§6.2, §8).

## 2. Service scope — `<service>/docs/`

Owner of every living file: `/generate-service-docs` (build/normalize) and `/upgrade-service-docs` (promote verified changes). Workflow agents read them; they do not edit them.

```
<service>/docs/
├── README.md            # Purpose, ownership, reading order; index of specs/ and adr/
├── architecture.md      # C4 container/component view, layers, key modules, entry points,
│                        #   deployment view, quality requirements (NFR/SLO)
├── business-logic.md    # Domain flows step by step, real class/method names
├── api-contracts.md     # Human-readable API summary + error codes; links the authoritative contract source (§6.4)
├── data-model.md        # Entities, tables, fields, relationships, invariants
├── events.md            # Domain events/topics: name, payload, producer, consumer
├── security.md          # Current posture: authN/Z, data classification, active security-rule register (§5 step 5)
├── configuration.md     # Config keys, feature flags, environment variables
├── troubleshooting.md   # Failure modes, dashboards, debugging playbook
├── diagrams/            # Mermaid sources used above
├── adr/                 # NNNN-<decision>.md — owner: tech-lead-subagent
├── specs/<feature>/      # Change specs (§4) — never touched by normalization
└── plans/               # Optional; plans not tied to one change — never touched by normalization
```

Living files describe **only what the code does now**. Design intent and gaps belong in specs; a living file may link to an open spec but does not narrate intent.

A single-repository project with no system root uses this layout at the repo root and also holds `glossary.md` there.

## 3. System scope — `<system-root>/docs/` (multi-service workspaces)

Same owners as §2.

```
<system-root>/docs/
├── README.md                       # Entry point + reading order
├── 00-overview/
│   ├── system-overview.md          # Purpose, architecture style, principles (C4 context)
│   └── service-map.md
├── 01-services/
│   ├── README.md
│   └── <service-name>.md           # Role + contract summary; links into <service>/docs/
├── 02-collaboration/
│   ├── end-to-end-flows.md
│   ├── sequence-diagrams.md
│   └── integration-points.md
├── 03-cross-cutting/
│   ├── all-apis-catalog.md
│   ├── all-events-catalog.md
│   ├── all-topics-and-queues.md
│   └── shared-concepts.md          # Cross-service entities, invariants, bounded contexts
├── 04-ai-friendly/
│   ├── how-to-add-new-service.md
│   ├── how-to-safely-modify-a-flow.md
│   ├── key-files-and-entrypoints.md
│   └── common-debugging-playbooks.md
├── glossary.md                     # Owner: tech-lead-subagent (ratifies BA-proposed terms)
├── adr/                            # Cross-service decisions — never touched by normalization
├── specs/<feature>/                 # Cross-service changes — never touched by normalization
└── plans/                          # Optional — never touched by normalization
```

## 4. Change spec — `docs/specs/<feature>/`

`<feature>` is a stable kebab-case slug naming **one change**, not a feature area (`auth-login`, then later `auth-login-mfa`). No numbers, dates or `-v2`. Re-runs reuse the folder only while its status is `proposed` or `accepted`; once `implemented` or `superseded`, a further change gets a new slug that links back.

| File | Single writer | Content | When |
|---|---|---|---|
| `README.md` | integrating session (main session/orchestrator) and `/upgrade-service-docs` | Frontmatter (below), one-paragraph summary, file index, traceability table (requirement → status → evidence) | Always |
| `requirements.md` | business-analyst-subagent | Stories, acceptance criteria (Gherkin or EARS), business rules (`US-n`, `AC-n`, `BR-n`), `Traces:` to `.planning/REQUIREMENTS.md` REQ-IDs when present, `New terms` | User-visible behavior |
| `ui-design.md` | ui-ux-designer-subagent | Flows, wireframes, all component states, responsive + accessibility rules | UI needing design |
| `security.md` | security-engineer-subagent | Threat model (assets, trust boundaries, STRIDE, OWASP) + numbered rules (`AUTH-01`…) with severity and provenance | Trust-boundary work |
| `design.md` | tech-lead-subagent | Design, contract delta, data-model delta, rollout, links to ADRs; RFC-style while open | New/changed contract or architecture |
| `contracts/` | tech-lead-subagent | Proposed machine-readable deltas (OpenAPI, AsyncAPI, JSON Schema, proto) | As above |
| `measurement.md` | business-analyst-subagent | Metrics, funnel, **analytics** event taxonomy (distinct from domain events), experiments, consent gating | Must be measurable |
| `concern-report.md` | tech-lead-subagent | Existing vs required compatibility analysis | Optional |
| `plan.md` | integrating session (`writing-plans`) | Tasks, ownership, order, parallelism, validation; exempt from freezing | Coordinated, full-workflow, orchestrator tiers |

`README.md` frontmatter — the **only** lifecycle metadata in the folder; other files carry none:

```yaml
---
status: proposed        # proposed | accepted | implemented | partially-implemented | superseded
scope: <service> | system
affects: [<service-or-module>, ...]
accepted_by: <name/date>            # set only on explicit user/team approval
source_revision: [<repo>@<sha>, ...] # set on promotion; one entry per affected repo
superseded_by: <slug>               # when applicable
updated: YYYY-MM-DD
---
```

`writing-software-docs` review labels (`Working Draft` / `Agent-Reviewed` / `Approved`) describe review provenance inside a document; they are not lifecycle status.

## 5. Lifecycle

1. **Propose.** Strategic agents write their own files; the integrating session creates `README.md` with `status: proposed`.
2. **Accept.** Only the integrating session sets `status: accepted`, and only after explicit user/team approval, recording `accepted_by`. Implementers consume `accepted` specs; they consume a `proposed` spec only when the dispatch says so explicitly.
3. **Decide.** A decision that outlives the change becomes an ADR; the spec links it instead of re-arguing it.
4. **Implement.** Implementers apply the accepted `contracts/` delta to the project's authoritative contract source (§6.4) and build against the spec. They never rewrite strategic files; contradictions found in code are returned as `DONE_WITH_CONCERNS`.
5. **Promote.** After QA `GO` or merge, `/upgrade-service-docs <service> <feature>` folds verified behavior into the living files, appends the change's active security rules to the living `security.md` register as `<feature>/AUTH-01` with a link, sets `status: implemented` (or `partially-implemented` with the traceability table showing pending items) and `source_revision`. Intent is never rewritten to match what shipped.
6. **Supersede.** A later change creates a new slug, marks the old `README.md` `superseded_by`, and retires its rules in the register.

## 6. Resolution rules (read before writing)

1. **Owning scope.** Service root for single-service work. The **system root** is the nearest ancestor holding a `docs/00-overview/` folder, or else the nearest ancestor containing two or more service roots — it is not tied to the name `Sources/`. Work only in authorized scopes. If services are separate git repos and the system root is not under version control, say so in the result; cross-service specs then cannot ride a feature branch.
2. **Reuse beats default.** If the project already has an equivalent location (`docs/security/`, `docs/decisions/`, `openapi/`, module READMEs, …), write there and return that exact path. Never migrate, rename or duplicate existing docs unless the user asks.
3. **One writer per file**, as named in §2–§4. Everyone else reads and cites.
4. **Authoritative contract source.** Discover it before writing: contract-first projects keep it in a schema folder the build consumes (`api/`, `openapi/`, `proto/` with buf, …); code-first stacks (springdoc, NestJS, FastAPI) generate it from code, so the code is the source and `api-contracts.md` links the generated spec. Create a new schema folder only in a contract-first project that lacks one. Prose files link to the source and never re-type schemas.
5. **Glossary.** Top-scope `glossary.md` (system root, or repo root for single-repo projects). BA proposes terms in `requirements.md`; tech-lead-subagent ratifies them into `glossary.md`. Per-service entities live in `data-model.md`; cross-service ones in `03-cross-cutting/shared-concepts.md`.
6. **`.planning/` is workflow state.** `/new-project` writes `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `research/`; `/map-codebase` writes `codebase/`. Specs trace to REQ-IDs through `requirements.md` `Traces:`; codebase maps are evidence for `/generate-service-docs`. Neither is linked as the description of the system, and their content is not copied into `docs/`.
7. **Fast path** creates no spec folder. If it changes documented behavior, update the affected living file in the same change.

## 7. Staleness

The check in `rules/strategic-output-persistence.md` applies to living files and to specs with status `proposed` or `accepted`. Specs that are `implemented`, `partially-implemented` (for their implemented items) or `superseded` are history and are never "refreshed"; readers use the living files for current behavior.

## 8. Legacy path mapping (for reading old projects or an explicit migration)

| Legacy | Canonical |
|---|---|
| `docs/requirements/<feature>.md` | `docs/specs/<feature>/requirements.md` |
| `docs/security/threat-model-*.md`, `rules-*.md`, `stride-*.md` | `docs/specs/<feature>/security.md` (+ register in living `security.md`) |
| `docs/contracts/*.yaml` | `docs/specs/<feature>/contracts/` (proposed) / authoritative contract source (implemented) |
| ADRs under `docs/contracts/` | `docs/adr/NNNN-<decision>.md` |
| `docs/design/<feature>.md` | `docs/specs/<feature>/ui-design.md` |
| `docs/domain/glossary.md`, `docs/domain/*` | top-scope `glossary.md`; `data-model.md` / `shared-concepts.md` |
| `docs/plans/YYYY-MM-DD-<topic>.md` for one change | `docs/specs/<feature>/plan.md` |
| Contracts in module READMEs | `api-contracts.md` + authoritative source; module READMEs keep a pointer |
