# Claude models and effort

Verified 2026-11-10 against [Which Claude model should you build with?](https://claude.dev/blog/which-claude-model-should-you-build-with) (2026-11-09), [Code model configuration](https://code.claude.com/docs/en/model-config), [subagents](https://code.claude.com/docs/en/sub-agents) and [Platform model overview](https://platform.claude.com/docs/en/models/overview). This is a starting policy, not a measured optimum for every task. Recheck these sources when upgrading.

| Model (alias) | Price in/out per MTok | Starting effort | Choose for |
|---|---|---|---|
| Haiku 5.5 (`haiku`) | $0.10/$0.50 ≤100K prompt; $0.50/$2.50 above | `medium` | Classification, routing, extraction; subagents that search files, read logs or summarize; checkable high-volume work. Not long agentic loops |
| Sonnet 5.5 (`sonnet`) | $2/$10 | `medium` → `high` | Well-scoped, spec-driven coding; repeated investigation/review/drafting; documents; interactive chat (`low`/`medium`) |
| Opus 5.5 (`opus`) | $4/$20 | `medium` → `high` | Default when unsure; everyday engineering, debugging, multi-PR features; judgment calls; computer use and vision |
| Fable 5.2 (`fable`) | $8/$40 | `medium` → `high` | Major refactors/migrations, architecture planning, leading many subagents, deep research, long unattended runs, or when Opus at `high` still falls short |

Exact Claude API IDs: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`; verify the current Fable ID in the Platform model overview before pinning it. The bundled `building-with-the-claude-api` reference was verified earlier (Fable 5.1); prefer the `fable` alias over a pinned ID. All four have a 1M context window and 128K max output.

## How to choose

- **Escalation order** when results are not good enough: (1) make sure the model can verify its own work (test, build, script); (2) raise effort one level; (3) move up one model, starting at a *lower* effort than you used on the smaller one. Past `high`, one more effort level can cost as much as a bigger model.
- Effort buys more thinking, tool calls and self-checking — not knowledge or skill. For missing capability, change model.
- Checkable tasks: run at `low`, re-run only failures at `high` (cheaper than everything at `high` at similar pass rate).
- Keep small models on work where mistakes are cheap to spot (finding files, running tests, reading logs). Keep code edits that need judgment, security analysis and reviews on a capable model.
- Orchestration pays off when a strong lead splits work for cheaper parallel workers; skip it for one chain of dependent steps or work that fits one context window.
- Price the hardest tasks in a set, not only typical ones. Switching models mid-session loses the prompt cache; moving down a tier drops the stronger model's reasoning — `/compact` or start fresh with a short plan.
- Do not enable paid fast mode or extra-usage modes automatically.

## tea-sdlc subagent defaults

Frontmatter sets the normal job; a dispatcher overrides `model` only when a task differs from it.

| Agent | Model | Effort | Rationale | Override up when |
|---|---|---|---|---|
| tech-lead-subagent | opus | high | Architecture and contract judgment; errors propagate to every implementer | `fable` for major migrations/refactors or system-wide architecture |
| security-engineer-subagent | opus | high | Threat modeling is a judgment call where misses are expensive and hard to spot | `fable` for novel auth/crypto/payment designs |
| code-reviewer | opus | medium | Independent gate; review findings are judgment, not checkable output | `high` for large or trust-boundary diffs |
| business-analyst-subagent | sonnet | medium | Requirements and measurement documents | `opus` for rigorous experiment design (power/MDE, sequential testing) |
| ui-ux-designer-subagent | sonnet | medium | Spec documents with explicit states and rules | — |
| backend / frontend / mobile / platform / data engineers | sonnet | high | Spec-driven coding against accepted contracts with tests to self-verify; `high` because these run in gated tiers where rework costs more than effort | `opus` for ambiguous bugs, cross-cutting refactors or when `high` still fails |
| qa-subagent | sonnet | medium | Runs tests and checks evidence; outputs are checkable | `high` for large release scopes |
| codebase-mapper | haiku | medium | File search, reading and summarizing | `sonnet` for very large or unconventional codebases |
| orchestrating-multi-domain-work (skill) | main session | — | Runs in the main session (Opus default, Fable for long multi-agent runs) | — |

## Use in Claude Code

- `claude --model opus --effort medium`: ordinary engineering session.
- `claude --model sonnet --effort medium`: clearly scoped implementation.
- `claude --model haiku --effort medium`: mechanical, verifiable work.
- `claude --model fable --effort high`: difficult or long autonomous work.
- `/model` and `/effort` inspect/change the session; `/status`, `/context`, `/hooks` show configuration, context use and active hooks.
- `opusplan` (Opus plans, Sonnet executes) is the reverse of the advice above; measure before making it a default.

Claude Code supports `low`, `medium`, `high`, `xhigh`, `max`. Save per-model preferences under `modelSettings` with `effortLevel` (`low` through `xhigh`); `max` is a session choice. Code defaults: Haiku `medium`, Sonnet `medium`, Opus `medium`, Fable `medium` (API defaults differ: Sonnet and Fable `high`). Code manages adaptive reasoning; API `thinking` objects are not Code settings.

## Custom agents

Agent frontmatter supports `model` (alias, exact ID, `inherit`) and `effort`. Resolution: provider/host overrides → explicit dispatch model → agent frontmatter → inherited parent model (`CLAUDE_CODE_SUBAGENT_MODEL` sets the default for agents without one). Omitting a model never guarantees Sonnet. On Bedrock, Google Cloud, Microsoft Foundry and Claude Platform on AWS the `haiku` alias may still resolve to Haiku 4.5; `ANTHROPIC_DEFAULT_HAIKU_MODEL` pins it. Do not infer a version from an alias on a gateway.

Give every model a clear goal, scope and evidence requirements. Use a complete template for mechanical Haiku work; concise constraints and outcome criteria for Opus/Fable. Ask for a decision and concise rationale, not private chain-of-thought. Preserve domain/security rules regardless of model.

## API is separate

API code uses request-level `output_config.effort`, adaptive reasoning and adequate `max_tokens`. Do not transplant Code settings into requests or API controls into settings.json. Use the `building-with-the-claude-api` skill for API work.
