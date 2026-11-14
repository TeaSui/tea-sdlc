---
name: session-bootstrap
description: Establish user workflow preferences at session start; use relevant skills without loading unrelated procedures.
---

# Session bootstrap

tea-sdlc bundled files live under `${CLAUDE_PLUGIN_ROOT}`. Inside its `rules/` and `references/` files, paths such as `rules/…`, `references/…`, `skills/…` and `templates/…` are relative to that plugin root, never to the target project or `~/.claude/`; project paths such as `docs/…` are relative to the target project.
When you paste a tea-sdlc template or rule into a subagent dispatch, expand those plugin-relative paths to absolute paths under `${CLAUDE_PLUGIN_ROOT}` so the subagent can Read them from the target project.

If dispatched for a specific subtask, follow that task's scope and skip session-wide intake.

These files express user preferences within the host's instruction hierarchy and native permission controls. Skills do not override system or developer instructions. Follow applicable scoped project instructions and direct user requests within those controls.

For substantive work, select the tier from `${CLAUDE_PLUGIN_ROOT}/rules/workflow-routing.md`. Use a skill when the user names it or it materially helps the task. Load only the relevant skill and supporting references; do not trigger a workflow from a remote keyword match. Prefer the Skill tool when available; otherwise read its documented entry point and disclose unavailable capabilities.

Three skills fit situations the user rarely names, so load the matching one before answering, including when the user describes the behavior in their own words: `clarify` when a request leaves open something that changes what gets built, or the user asks to be asked questions first; `expert-lens` when the user asks what a top practitioner would think or do, or wants work held to a specialist production standard; `reframe` when the user states a consequential plan or belief and asks for an opinion, a challenge or a fresh perspective. A clear routine request needs none of them.

Use the actual task/agent tools exposed by the runtime. Track meaningful multi-step work; a short answer needs no task scaffold. Planning and review depth follow the routing tier.

Reuse authorization already given for the same scope. Continue reversible, necessary work and routine choices the user delegated. Ask when a material decision cannot be resolved, or when native permissions or a separately controlled action require it. Keep secrets, destructive actions, external publishing and security gates within their authorized scope.

Current model and effort guidance is in `${CLAUDE_PLUGIN_ROOT}/references/model-guide.md`; consult it when choosing or changing models, not on every turn. Verify outcomes with relevant evidence and report limits candidly.
