# tea-sdlc

> Comprehensive Software Development Life Cycle (SDLC) plugin for Claude Code.

`tea-sdlc` transforms Claude Code into an enterprise-grade autonomous engineering team with 12 specialized subagents, 4-tier workflow routing, automated quality gates, and battle-tested domain skills.

---

## 🚀 Quick Install

### Option 1: Claude Code Marketplace (Recommended)

In any Claude Code session, run:

```bash
/plugin marketplace add TeaSui/tea-sdlc
/plugin install tea-sdlc
```

Or install in one command:

```bash
/plugin install tea-sdlc --marketplace TeaSui/tea-sdlc
```

### Option 2: Local Development Mode

Load directly from your local clone:

```bash
claude --plugin-dir /path/to/tea-sdlc
```

Or configure permanently in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/tea-sdlc"
  }
}
```

---

## 🏗️ Architecture & Features

### 1. 12 Specialized Subagents (`agents/`)

| Agent | Role & Ownership |
|---|---|
| `tech-lead-subagent` | Architecture decisions, API contracts (OpenAPI), and module interfaces |
| `security-engineer-subagent` | Threat modeling (STRIDE), PII, auth, and secret boundaries |
| `backend-engineer-subagent` | API implementation, business logic, DB access (Go, Java/Spring, Python, Rust), LLM/RAG/agent features with evals |
| `frontend-engineer-subagent` | UI components, WCAG accessibility, client performance (React, Next.js) |
| `mobile-engineer-subagent` | Flutter, iOS (Swift/SwiftUI), Android (Kotlin), biometric & offline sync |
| `platform-engineer-subagent` | AWS CDK/serverless, non-AWS IaC, CI/CD pipelines, Docker, Kubernetes, observability |
| `data-engineer-subagent` | ETL/ELT pipelines, Spark/Databricks, Delta Lake, warehouse schemas |
| `ui-ux-designer-subagent` | User flows, wireframes, component design specifications |
| `business-analyst-subagent` | User stories, acceptance criteria (Gherkin/BDD), MVP scoping, measurement plans and experiment design |
| `code-reviewer` | Read-only multi-dimension code review before PR |
| `qa-subagent` | Final validation gate against specs, acceptance criteria and test coverage, plus live API smoke/perf/security/stress checks |
| `codebase-mapper` | Parallel exploration to generate `.planning/codebase/` documentation |

---

### 2. 4-Tier Workflow Routing (`rules/workflow-routing.md`)

Tasks are automatically classified based on trust boundary (PII, Auth, Payments, Public Surface, IAM/Secrets) and domain count:

```
Trust Boundary?
 ├─ NO
 │   ├─ 1 Domain  ──► Fast Path (TDD, no subagent dispatch)
 │   └─ 2+ Domains ──► Coordinated Fast Path (Lightweight plan + leaf agents)
 └─ YES
     ├─ 1 Domain  ──► Full Workflow (Security gate → Tech Lead → SDD → QA)
     └─ 2+ Domains ──► Orchestrator (main session runs `orchestrating-multi-domain-work` skill)
```

---

### 3. Automated Safety & Quality Gates (`hooks/`)

Configured via `hooks/hooks.json`:

- **Pre-Commit Secret Gate (`hooks/security-gate.py`)**:
  Runs `gitleaks` automatically before any `git commit` or `git push`. Fails closed if secrets are detected.
- **Pre-PR Review Gate (`hooks/pr-review-gate.py`)**:
  Blocks `gh pr create` until a pre-PR self-review has been recorded for the current `HEAD` via `scripts/mark-pr-review.py`.
- **Session Bootstrap (`hooks/session-start`)**:
  Initializes session context and workflow routing preferences at startup without manual user prompting.

---

### 4. Custom Slash Commands (`commands/`)

- `/tdd-feature`: Test-driven feature implementation with failing tests first.
- `/prove-it`: Challenges completion claims by verifying exact assertions.
- `/new-project`: Structured project scaffolding through questioning and requirements roadmap.
- `/map-codebase`: Analyzes codebase with parallel mapper agents into `.planning/codebase/`.
- `/debug-parallel`: Multi-service parallel diagnostic and root-cause fix.
- `/prompt-builder`: Interactive Claude prompt architect.
- `/eval-upgrade`: Evaluates and scores Claude Code assets with champion/challenger arena.

---

### 5. Domain Skills & Standards (`skills/` & `rules/`)

- **API Contract Testing**: Consumer-driven contracts with Pact & OpenAPI.
- **Fintech Security**: MAS TRM compliance, PII masking, token management.
- **BDD / Cucumber**: Gherkin feature files with step definitions.
- **Database Patterns**: CTE-first SQL, zero-downtime migrations, DynamoDB single-table design.
- **Single Source of Truth**: Litmus tests preventing stale documentation duplication.
- **Documentation Layout** (`references/documentation-layout.md`): one canonical project-docs structure for every agent and command — living reference docs (`docs/*.md`, system `docs/00-overview…04-ai-friendly`), per-change specs (`docs/specs/<feature>/`), ADRs (`docs/adr/`), with an explicit propose → accept → implement → promote lifecycle.

---

## 📁 Repository Structure

```
tea-sdlc/
├── .claude-plugin/
│   ├── plugin.json         # Plugin manifest
│   └── marketplace.json    # Marketplace registry manifest
├── agents/                 # 12 subagent definitions
├── commands/               # Slash command definitions
├── hooks/
│   ├── hooks.json          # Hook lifecycle configurations
│   ├── pr-review-gate.py   # PR review verification hook
│   ├── security-gate.py    # Gitleaks pre-commit secret scanner
│   └── session-start       # SessionStart bootstrap hook
├── references/             # Engineering guidelines & patterns
├── rules/                  # Routing, review limits, single source of truth
├── scripts/                # Verification & diagnostic helper scripts
├── skills/                 # Domain skills & workflows
└── README.md
```

---

## 📄 License

MIT © [Tea Nguyen](https://github.com/TeaSui)
