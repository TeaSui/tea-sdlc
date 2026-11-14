---
name: clarify
description: Use before starting a task when the request leaves open something that changes what gets built (scope, behavior, data, interface, anything expensive to undo), or when the user asks to be asked clarifying questions first. Inspects the project, then asks only the questions whose answers change the work, each with the default that applies if unanswered. Skip for clear or routine requests.
---

Task: $ARGUMENTS

When no task is given, use the task currently under discussion.

**Look before asking.** Read the project instructions, the code involved, existing specs/ADRs and the earlier messages. Do not ask for anything those sources answer.

**Sort what is still open:**

- It would change what gets built — scope, behavior, data, an interface, a trust-boundary item in `${CLAUDE_PLUGIN_ROOT}/rules/workflow-routing.md`, or anything expensive to undo → ask.
- It would not → choose a reasonable default, list it in one line under "Assumptions", and do not ask.

**Ask in one batch**, most consequential first, five questions at most. Use the runtime's question tool when one is available. Each question:

- is concrete: offers options or an example instead of an open "what do you want?";
- says in one line what the answer changes;
- names the default you will use if it goes unanswered.

Ask a second round only when an answer opens a new question of the first kind. Stop when the remaining unknowns no longer change the work: state what you are still assuming, then start. If the user asked only for clarification, restate the task as you now understand it in three to five lines and wait.

If nothing material is open, say so in one line and start. Do not manufacture questions to look thorough.
