---
description: Score, upgrade and A/B-duel Claude Code assets (agents, commands, rules, skills) with the bundled eval-upgrade tool — static checks with a 0-100 score, LLM upgrade proposals, and champion/challenger arena duels with guarded auto-promotion. Use to audit, score, improve or duel the assets of a .claude directory or a plugin checkout.
argument-hint: "[eval | dashboard | arena <challenger|duel|status|promote|discard> <artifact-id> [rounds] | config] [--target <dir>] [--types agents,commands,rules,skills] [--llm]"
---

# /eval-upgrade — evaluate and upgrade Claude Code assets

Run the bundled tool for the request in `$ARGUMENTS` and report what it printed. With no arguments, run a static evaluation.

The tool ships inside this plugin at `${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade` and needs only Node 20 or newer. Its `README.md` in that directory is the reference for the checks, the scoring formula, arena rules, the dashboard API and the security model; read it when a question goes beyond this page. Hooks are out of scope: the tool evaluates instruction files, not executable code.

## Commands

```bash
# Evaluate: static checks and scores. Free, no model calls unless --llm is passed.
node "${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade/bin/run.mjs" [--target <dir>] [--types agents,commands,rules,skills] [--llm] [--json]

# Arena: champion (the file on disk) against a generated challenger.
node "${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade/bin/arena.mjs" challenger <artifact-id>   # generate challenger + task bank
node "${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade/bin/arena.mjs" duel <artifact-id> [N]     # run N rounds (default 1)
node "${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade/bin/arena.mjs" status                     # active arenas
node "${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade/bin/arena.mjs" promote <artifact-id>      # promote now, skipping the threshold
node "${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade/bin/arena.mjs" discard <artifact-id>      # retire the challenger

# Config: effective settings and where state is stored.
node "${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade/bin/run.mjs" --show-config

# Dashboard: long-running, so start it as a background Bash task.
node "${CLAUDE_PLUGIN_ROOT}/tools/eval-upgrade/server.mjs" --open
```

Artifact ids are `<type>/<name>` as listed by the evaluation: `skills/goal`, `agents/code-reviewer`, `rules/patterns`, `commands/prove-it`.

## Choosing the target

The target is any directory that holds `agents/`, `commands/`, `rules/` or `skills/` subfolders.

- No target named: the tool evaluates the user-level `~/.claude`. Say in the report which directory was evaluated.
- A project's assets: `--target <project>/.claude`.
- A plugin under development: `--target <root of the plugin's source checkout>`.

Upgrades and promotions overwrite files in the target, so point them only at a directory the user edits. An installed plugin's cache copy is replaced on every plugin update: evaluating it is fine, but a promotion written there is lost, so duel against the source checkout instead.

An arena works on the most recent evaluation. Before `arena challenger`, run the evaluation for the same target; the artifact id must appear in that run.

## What each action costs

Every model call is a separate headless `claude -p` run billed to the user.

| Action | Model calls |
|---|---|
| Evaluate | 0 |
| Evaluate with `--llm` | 1 per artifact scoring below 100, capped at `llmReview.maxArtifacts` (default 10) |
| `arena challenger` | 2 (the challenger, then the task bank) |
| `arena duel`, per round | 3 (two answers, one judge) |

At the default thresholds an arena settles within 13 rounds, about 39 calls. When the user's request already names the action and its size (`arena duel skills/goal 5`), run it. When you are the one adding `--llm`, a challenger or a number of rounds, state the call count first and wait for a yes.

## Promotion

The challenger is promoted automatically only if it reaches `arena.pointsToWin` (10) before the champion reaches `arena.pointsToDefend` (4); otherwise it is retired and the file stays as it was. A promotion overwrites the artifact and leaves a timestamped `.bak` beside it. When one happens:

- Report the artifact, the final score and the backup path the tool printed.
- To undo, copy the backup over the artifact. In a git repository, `git diff` shows the change; the `.bak` file is not meant to be committed.

`arena promote` skips the threshold, so run it only on the user's explicit request.

## Reading the results

- The score is `100 − 25·errors − 8·warnings`, never below 60 when there are no errors. Report the findings behind the number; the number alone says little.
- The static checks are heuristics. When a finding is a false positive for that artifact (for example a description that triggers well without the literal phrase "use when"), say so; do not reword an asset only to satisfy a check.
- An arena compares single-turn text answers to a generated task bank, scored by a model judge. A win is evidence of better answers on those tasks, not proof of better behavior in real sessions with tools. Present it that way, and show the judge's reasoning for the rounds that decided it.

## Config and state

Results, proposals, arena ledgers and `config.json` live in `~/.claude/state/eval-upgrade` (or `$EVAL_UPGRADE_STATE_DIR`), outside the plugin, so they survive plugin updates. `config.json` is optional and holds only the keys the user changed; `--show-config` prints the effective values. Change settings by editing that file or through the dashboard. Everything else in the state directory is generated: read it, do not edit it by hand.

## Dashboard

`--open` hands the session URL to the user's browser directly; tell the user it is running at `http://127.0.0.1:4600` and stop the background task when they are done. If no browser can be launched (remote or headless session), the server prints the full URL instead: give the user that URL exactly as printed, because the token in it is what authorizes the dashboard's buttons.

## Auto-trigger

The plugin registers a background `PostToolUse` hook that can advance an existing arena by one round when its skill or agent is used in a real session, at most once per artifact per day. It does nothing unless `autoTrigger.enabled` is `true` in `config.json`, and it never creates a challenger. It spends tokens without a prompt, so enabling it is the user's decision: change that setting only when the user asks for it. Its log is `arena/auto-trigger.log` in the state directory. This is not a live A/B test of the session; it only moves an offline arena forward.

## When it cannot run

- `node` missing or older than 20: report that and stop.
- `claude` not on `PATH`: the static evaluation still works; `--llm` and the arena fail with the tool's own error. Report the error as printed.
