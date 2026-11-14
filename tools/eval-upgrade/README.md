# eval-upgrade

Evaluate & upgrade system for Claude Code assets — **agents, commands, rules, skills** —
in any `.claude` directory or plugin checkout (defaults to `~/.claude`). Zero dependencies;
requires Node ≥ 20. Ships inside the tea-sdlc plugin; `/eval-upgrade` is its slash command.

Hooks are deliberately out of scope: they are executable code, not instruction files.

## Quick start

Paths below are relative to this directory; the commands work from any working directory.

```bash
node bin/run.mjs                       # evaluate ~/.claude: score every artifact, print summary
node bin/run.mjs --target /path/to/dir # evaluate another .claude directory or a plugin checkout
node bin/run.mjs --show-config         # effective config + state directory
node server.mjs --open                 # dashboard, opened in the browser with its session token

node bin/arena.mjs challenger skills/goal   # start a champion/challenger arena
node bin/arena.mjs duel skills/goal 3       # run 3 duel rounds
node bin/arena.mjs status                   # list arenas
```

## Code and state

The code is read-only and lives here, inside the plugin. Everything the tool writes lives in
the **state directory**, `~/.claude/state/eval-upgrade` (override: `EVAL_UPGRADE_STATE_DIR`),
because a plugin's install directory is replaced on every update:

```
~/.claude/state/eval-upgrade/
├── config.json   optional; only the keys you changed (defaults are in lib/evaluate.mjs)
├── results/      run history + latest.json
├── proposals/    upgrade proposals + source-hash metadata
└── arena/        ledgers/, tasks/, challengers/, archive/, auto-trigger.log
```

## The three layers

### 1. Evaluate (static, free)

Scan → per-type checks → findings + 0-100 score → `results/latest.json` + history.

- Common: frontmatter validity, description quality, size budgets, `TODO:`/`FIXME:`
  markers, broken references to other `.claude` assets (fenced code skipped, multi-base
  resolution before flagging).
- Skills: name/directory match, trigger-rich description, bundled resources exist.
- Agents: name, description with `<example>` blocks, tool scoping.
- Rules: H1 title, cross-references resolve.
- Optional **LLM review** (`llmReview.enabled`, off by default): `claude -p` audits
  low-scoring artifacts against a per-type rubric.

**Scoring:** `score = 100 − 25·errors − 8·warnings`. `info` findings are observations,
never scored. Zero errors ⇒ floor of 60. Don't chase 100 — read the findings.

### 2. Upgrade (proposals, human-gated)

Per artifact, "Propose upgrade" generates an improved version via `claude -p`
(`upgrade.model`, default `opus`) into `proposals/`. Apply from the dashboard writes a timestamped
`.bak` first and refuses if the file changed since generation (content-hash guard).

### 3. Arena (champion/challenger duels, points-based replacement)

The file on disk is the **champion**; a generated variant is the **challenger**.
Duels run **offline** via `claude -p` — never inside your live sessions:

1. **Register** a challenger → generates the variant + a task bank of realistic prompts.
2. **Duel**: both variants answer the same task in parallel; a **blind judge**
   (randomized order, no labels — LLM judges are position-biased) picks the response that
   better serves the person who asked: +1 point.
3. **The burden of proof is on the challenger.** It must reach `arena.pointsToWin`
   (default 10) before the champion reaches `arena.pointsToDefend` (default 4):
   - challenger gets there first → **auto-promoted** onto disk (timestamped `.bak` backup, ledger archived)
   - champion gets there first → challenger retired ("defended")
4. Manual override any time: `promote` / `discard`.

Why asymmetric: in a symmetric first-to-10 race a challenger that is exactly as good as the
champion wins half the time, so auto-promotion would overwrite files on a coin flip. With
10 vs 4 an equal challenger is promoted about 5% of the time (it needs ≥10 wins in the
first 13 rounds), while one that genuinely wins 80% of rounds is promoted about 75% of the
time. Set `pointsToDefend` equal to `pointsToWin` to get the symmetric race back.

What a win means: the duel compares single-turn text answers (the spawned `claude -p` runs
with no tools, no skills and no slash commands, so the installed copy of the asset under test
cannot leak in) on an LLM-generated task bank, scored by an LLM judge. That is evidence of
better answers on those tasks, not proof of better behavior in real tool-using sessions.
Edit the task bank (dashboard) to match real usage before trusting a result.

Safety: duels refuse if the champion changed on disk since registration (arena goes
`stale` — re-register); promotion refuses paths outside the directory the artifact was
evaluated in; duels and promotion are refused for types that are toggled off.

Each duel costs 3 `claude -p` calls (2 executions + 1 judge); registering a challenger costs 2.
An arena settles within 13 rounds at the defaults — a real token spend, so trigger duels in
batches when you care about an artifact, not ambiently.

Do not point upgrades or promotions at an installed plugin's cache copy: the next plugin
update replaces it. Duel against the plugin's source checkout (`--target <checkout>`).

### Real-session auto-trigger (opt-in)

There is no way to fork a live Skill/Agent invocation into a parallel A/B run inside a real
session — tool calls have side effects, and no interception point can duplicate a turn. What
*is* wired up: a `PostToolUse` hook (`hooks/auto-trigger.mjs`, registered by the plugin's
`hooks/hooks.json`, matcher `Skill|Task|Agent`, `async: true`) that fires **after** a
real Skill or Agent call completes and, entirely in the background, checks whether an arena
duel is due for that artifact:

- **Never auto-registers a challenger.** It only advances an arena you already started
  (`arena.mjs challenger <id>` or the dashboard). No active arena ⇒ silent no-op.
- **Gated by `autoTrigger.enabled`** (default `false`) **and** the artifact's type toggle.
  Both must be on, or the hook stays silent — same gate `arena.mjs` itself uses.
- **Throttled** (`autoTrigger.throttle`: `day` default, or `session`) so a skill used 10 times
  in one session doesn't spawn 10 background duels.
- **Recursion-guarded**: every `claude -p` call the tool makes runs with
  `EVAL_UPGRADE_AUTO_TRIGGER_ACTIVE=1`, which the hook checks and exits on immediately —
  a duel can never cascade into more duels.
- **Namespace-aware**: plugin assets arrive as `plugin:name`; the hook matches on the bare name.
- **Never touches the transcript**: no stdout, exits 0 unconditionally; everything is logged
  to `arena/auto-trigger.log`.

The hook is registered for every plugin user but stays inert until `autoTrigger.enabled` is
set to `true` in the state directory's `config.json`.

## Toggles

- **Master** (`enabled`): off ⇒ CLI and arena refuse to run; dashboard shows disabled.
- **Per-type** (`targets.agents|commands|rules|skills`): off ⇒ excluded from evaluation
  AND arena (no duels, no promotions) — "use the main artifact, ignore challengers".
- **LLM review** (`llmReview.enabled`): opt-in, bounded by `llmReview.maxArtifacts`.
- Arena knobs: `arena.pointsToWin`, `arena.pointsToDefend`, `arena.executorModel`,
  `arena.judgeModel`, `arena.tasksPerArtifact`.
- Models are family aliases (`sonnet`, `opus`, …) that the `claude` CLI resolves to the
  newest release; avoid pinned ids, which go stale.

Edit `config.json` in the state directory (create it with just the keys you want to change),
use the dashboard (staged toggles + explicit **Save config**), or
override per-run: `node bin/run.mjs --target /path/.claude --types skills,rules --llm`.

## Dashboard

`node server.mjs --open` opens `http://127.0.0.1:4600/?token=…` in the browser
(without `--open` the URL is printed instead; `EVAL_UPGRADE_PORT` changes the port).

- Summary cards + sortable/filterable artifact table with expandable findings
- Per-artifact **Arena** button → points bars, duel history with judge reasoning,
  task bank, side-by-side champion/challenger compare, duel/promote/discard controls
- **Propose upgrade** → proposal modal with hash-guarded Apply

Security: binds `127.0.0.1` only; loopback `Host` check (DNS-rebinding guard);
per-session random token required on every mutating call; `{data, meta}` / `{error}`
envelope per `rules/patterns.md`; text from evaluated files and model output is HTML-escaped.

## Testing without tokens

`EVAL_UPGRADE_FAKE_LLM=1` stubs every `claude` call with deterministic canned output, so
the full pipeline (review, upgrade, task bank, duels, promotion) can be exercised for free:

```bash
export EVAL_UPGRADE_FAKE_LLM=1 EVAL_UPGRADE_STATE_DIR="$(mktemp -d)"   # throwaway state
node bin/run.mjs --target /path/to/a/copy
node bin/arena.mjs challenger skills/foo
node bin/arena.mjs duel skills/foo 13
```

Use a copy as the target: a fake challenger that wins is promoted like a real one.

## Layout

```
eval-upgrade/
├── bin/run.mjs        evaluation CLI
├── bin/arena.mjs      arena CLI (challenger, duel, status, promote, discard)
├── server.mjs         localhost dashboard + API
├── lib/
│   ├── paths.mjs      tool root + state directory (single source of truth for locations)
│   ├── scan.mjs       artifact discovery
│   ├── checks.mjs     static checks + scoring
│   ├── evaluate.mjs   default config, run orchestration + results persistence
│   ├── llm.mjs        claude -p runner (serialized, neutral cwd, no tools, fake mode)
│   └── arena.mjs      duels, points ledger, promotion
├── hooks/auto-trigger.mjs  PostToolUse hook: real-session auto-duel (opt-in, see above)
└── ui/                static HTML/CSS/JS dashboard
```

## API (all JSON, envelope-wrapped; token required on POST/PUT)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` · PUT `/api/config` | read / persist toggles & target |
| GET | `/api/results/latest` · `/api/results` | latest run / history list |
| POST | `/api/run` | run evaluation (409 if running) |
| POST | `/api/upgrade` `{id}` | generate proposal |
| GET | `/api/proposal?id=` | stored proposal + metadata |
| POST | `/api/apply` `{id, confirm:true}` | apply proposal (hash-guarded, .bak) |
| GET | `/api/arena/status` · `/api/arena/detail?id=` | arenas overview / full ledger + contents |
| POST | `/api/arena/challenger` `{id}` | register challenger + task bank |
| POST | `/api/arena/duel` `{id, rounds}` | run duel rounds (auto-promote at threshold) |
| PUT | `/api/arena/tasks` `{id, tasks}` | edit the task bank |
| POST | `/api/arena/promote` `{id, confirm:true}` | manual promotion |
| POST | `/api/arena/discard` `{id, confirm:true}` | retire challenger |
