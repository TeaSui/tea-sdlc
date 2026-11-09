# tea-sdlc

> Comprehensive Software Development Life Cycle (SDLC) plugin for Claude Code.

`tea-sdlc` transforms Claude Code into an enterprise-grade autonomous engineering team with 17 specialized subagents, 4-tier workflow routing, automated quality gates, and battle-tested domain skills.

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

### 1. 17 Specialized Subagents (`agents/`)

| Agent | Role & Ownership |
|---|---|
| `agent-orchestrator` | Coordinates multi-domain trust-boundary tasks (Security → Contracts → Execution → QA) |
| `tech-lead-subagent` | Architecture decisions, API contracts (OpenAPI), and module interfaces |
| `security-engineer-subagent` | Threat modeling (STRIDE), PII, auth, and secret boundaries |
| `backend-engineer-subagent` | API implementation, business logic, DB access (Go, Java/Spring, Python, Rust) |
| `frontend-engineer-subagent` | UI components, WCAG accessibility, client performance (React, Next.js) |
| `mobile-engineer-subagent` | Flutter, iOS (Swift/SwiftUI), Android (Kotlin), biometric & offline sync |
| `devops-engineer-subagent` | CI/CD pipelines, Docker, Kubernetes, observability |
| `aws-infrastructure-subagent` | AWS CDK (TypeScript/Python), Lambda, DynamoDB, API Gateway, SQS |
| `data-engineer-subagent` | ETL/ELT pipelines, Spark/Databricks, Delta Lake, warehouse schemas |
| `ai-engineer-subagent` | LLM integration, prompt engineering, RAG, agentic tools |
| `ui-ux-designer-subagent` | User flows, wireframes, component design specifications |
| `business-analyst-subagent` | User stories, acceptance criteria (Gherkin/BDD), MVP scoping |
| `growth-marketer-subagent` | Analytics taxonomies, funnel metrics, experiment design |
| `code-reviewer` | Read-only multi-dimension code review before PR |
| `qa-subagent` | Final validation gate against specs, acceptance criteria, and test coverage |
| `api-test-agent` | Black-box endpoint validation, stress, and security-smoke tests on running APIs |
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
     └─ 2+ Domains ──► Orchestrator (Full multi-agent pipeline with gates)
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

---

## 📁 Repository Structure

```
tea-sdlc/
├── .claude-plugin/
│   ├── plugin.json         # Plugin manifest
│   └── marketplace.json    # Marketplace registry manifest
├── agents/                 # 17 subagent definitions
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
