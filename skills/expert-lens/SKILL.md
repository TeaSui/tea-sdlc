---
name: expert-lens
description: Use when the user asks what an expert or top practitioner in a field would think or do, asks how the best people handle something, or wants an approach held to a specialist production standard (payments, security, data, infrastructure and similar). Reports what that practitioner would notice that a competent generalist misses, do first and refuse to do. Skip for routine explanations and edits.
---

Target: $ARGUMENTS

When no target is given, use the task or decision currently under discussion.

Name the specific kind of practitioner whose judgment matters here: "a payments engineer who has run ledger migrations", not "a senior engineer". Read the relevant code, documents or data before answering; expertise applied to a guessed situation is generic advice.

Answer in this order:

1. **What they would notice** — the two or three things in this situation that a competent generalist would miss. Give the evidence for each (`path:line`, command output, document) or mark it as an inference.
2. **What they would do first** — one next action, and why it comes before the obvious one.
3. **What they would refuse to do** — the tempting move they would skip, and what it costs.
4. **Where they would disagree with the current plan** — or "no disagreement" when there is none.

Leave out anything a competent generalist would already say. If the current approach is already what that practitioner would do, say so in one line and stop; do not invent an insight to fill the format.

If the request asked for action as well as a view, carry out item 2 within the scope already authorized and the tier in `${CLAUDE_PLUGIN_ROOT}/rules/workflow-routing.md`. Otherwise stop after the answer.
