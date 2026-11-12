---
description: Generate an optimal Claude prompt from a user description. Software-change requests get a prompt that follows the tea-sdlc flow (spec → adr → tdd → implement → test → create PR); other tasks get a minimal or full XML-structured prompt. Asks clarifying questions when details are missing.
argument-hint: "[description of what you want the prompt to do]"
---

# /prompt-builder

## Objective

Turn a natural-language description of a task into a well-structured Claude prompt. Ask for missing details before generating.

- **Software change** (build, add, modify, fix or refactor code): generate an **SDLC-flow prompt** that makes the executing session follow `spec → adr → tdd → implement → test → create PR`, in that order, with a gate between stages.
- **Anything else** (classification, extraction, writing, analysis): choose between **minimal** and **full** based on complexity.

## Arguments

- `$ARGUMENTS` — free-text description of the prompt's purpose.
- If `$ARGUMENTS` is empty: ask the user "What do you want this prompt to do?" and wait.

## Process

### 1. Parse the input

Extract what you can from `$ARGUMENTS`:

| Field | What to look for |
|---|---|
| **Role** | Who the AI is ("act as a", "you are a", domain expert implied) |
| **Task** | The verb — summarize, classify, extract, rewrite, answer |
| **Inputs** | Documents, variables, user text the prompt will receive |
| **Output format** | JSON, markdown, free text, table, code |
| **Constraints** | Tone, length, rules, things to avoid |
| **Examples** | Any sample input/output pairs mentioned |

### 1b. Pick the track

Software change → **SDLC-flow track** (§4a). Otherwise → minimal/full track (§3, §4b). If the user explicitly asks for a generic prompt for a dev task, honor it.

For the SDLC-flow track also extract: **service/repo**, **feature slug** (stable kebab-case, one change — `auth-login-mfa`, no numbers/dates/`-v2`), **acceptance criteria**, **trust boundary** (any item in `${CLAUDE_PLUGIN_ROOT}/rules/workflow-routing.md` → treat as YES when unsure), **domain count**, and whether a **contract/API/schema** changes. The tier (fast path / coordinated / full workflow / orchestrator) decides how heavy each stage is; never skip a stage, shrink it.

### 2. Decide: enough info?

**Enough info** means you can write a concrete `<role>`, a concrete `<task>`, and at least one `<constraints>` bullet. If any of these are completely missing or vague, ask.

**Ask ONE targeted question per gap** (not a list of 6). Pick the most important missing piece. After the user answers, re-evaluate — ask a second question only if a second gap remains. Stop asking after 3 rounds maximum; fill remaining gaps with sensible defaults and flag them.

Examples of targeted questions:
- "What should Claude output — JSON, markdown, or free text?"
- "Who is the role here — a customer support agent, a code reviewer, a data analyst?"
- "Will the prompt receive a long document, or just a short user query?"

### 3. Choose version (minimal/full track only)

Use **Full** when ANY of these apply:
- Prompt will receive documents or long variable content (>~500 tokens)
- Task has multiple steps or edge cases to handle explicitly
- Output needs a concrete schema (JSON, table, structured format)
- 3+ examples are needed to teach the pattern
- Constraints are complex or counter-intuitive

Use **Minimal** otherwise (simple one-step tasks, short inputs, free-text output).

If the user explicitly requests a version, honor it.

### 4a. SDLC-flow prompt (software changes)

Generate this prompt. Fill every `[...]` from the parsed input; leave `[TODO: ...]` + flag when unknown. Artifact paths follow `${CLAUDE_PLUGIN_ROOT}/references/documentation-layout.md`.

```xml
<role>
You are a senior engineer on [service/repo], working through the tea-sdlc flow. You deliver one change end to end and never skip a stage; you may shrink one to match the change's tier.
</role>

<task>
[One imperative sentence: the change to deliver.]
</task>

<context>
- Service/repo: [name, path]
- Feature slug: [kebab-case]
- Acceptance criteria: [list, or "derive from the description and confirm in stage 1"]
- Tier: [fast path | coordinated fast path | full workflow | orchestrator] — [why, citing the trust-boundary items hit]
- Contract/schema change: [yes — what | no]
</context>

<workflow>
Execute in order. Finish a stage and meet its gate before starting the next. Report the stage you are in.

1. SPEC — define what changes and why.
   - Full workflow / orchestrator: write `docs/specs/[slug]/` (`requirements.md` with US/AC/BR ids, `security.md` for trust boundaries, `design.md` + `contracts/` for contract changes) and `README.md` with `status: proposed`.
   - Fast path: state the approach and acceptance criteria in 2–3 lines; no spec folder.
   - Gate: user approves the spec (set `status: accepted`, `accepted_by`). Do not continue on a `proposed` spec unless told to.

2. ADR — record decisions that outlive the change.
   - For each significant decision (architecture, data model, new dependency, API style, security posture), write `docs/adr/NNNN-<decision>.md` (context, options, decision, consequences) and link it from the spec's `design.md`.
   - If no such decision exists, write one line: "No ADR needed: [reason]". Never rewrite an accepted ADR; supersede it with a new one.
   - Gate: every decision the spec depends on has an ADR or an explicit "no ADR needed".

3. TDD — write failing tests first.
   - Read 2–3 existing tests for conventions. Write tests for happy path, edge cases and error conditions from the acceptance criteria, not from the implementation.
   - Run them with the project's own test runner; they MUST fail for the expected reason. Show the failing output.
   - Gate: failing tests exist and fail correctly.

4. IMPLEMENT — minimum code to go green.
   - Apply the accepted `contracts/` delta to the project's authoritative contract source. Do not add untested behavior or weaken assertions.
   - Contradictions with the spec are reported, not silently fixed in the spec.
   - Gate: the new tests pass.

5. TEST — prove it.
   - Run the full suite (and build, lint, live API validation if a service is running). Fix regressions.
   - Fast path: single pre-PR pass per `${CLAUDE_PLUGIN_ROOT}/rules/pre-pr-review.md`. Higher tiers: code review and QA `GO`.
   - Gate: all checks green with evidence; skipped or unavailable checks are stated explicitly.

6. CREATE PR — hand off.
   - Branch from the default branch, commit in logical steps, open the PR. The description links the spec and ADRs, lists the acceptance criteria with evidence, and notes risks and skipped checks.
   - After merge, run `/upgrade-service-docs [service] [slug]` to promote the spec into the living docs.
</workflow>

<constraints>
- Follow the stages in the order given; do not implement before the spec is accepted and the failing tests exist.
- Reuse existing project locations for docs and contracts before creating new ones.
- Report only what you ran; never claim a skipped check passed.
- If you lack information needed for a stage, stop and ask one targeted question instead of guessing.
</constraints>

<output_format>
After each stage, one line: `Stage N <name>: done | blocked — <artifact path or evidence>`. Final message: PR link, acceptance-criteria table (criterion → test → result), open risks.
</output_format>

<user_query>
[Verbatim $ARGUMENTS]
</user_query>
```

### 4b. Minimal/full prompts (non-software tasks)

#### Minimal version

```xml
<role>You are [role]. You [one-sentence mission].</role>

<instructions>
1. [Step 1]
2. [Step 2]
3. [Step 3]
</instructions>

<constraints>
- [Hard rule]
- [Output format rule]
</constraints>

<examples>
  <example>
    <sample_input>...</sample_input>
    <ideal_output>...</ideal_output>
  </example>
</examples>

<user_query>{{USER_INPUT}}</user_query>
```

#### Full version

```xml
<role>
[One or two sentences. Who Claude is and what it does.]
</role>

<task>
[One imperative sentence: what to produce this turn.]
</task>

<!-- Long variable content goes FIRST for cache efficiency -->
<documents>
  <document index="1">
    <source>filename-or-id</source>
    <document_content>
      {{VAR_1}}
    </document_content>
  </document>
</documents>

<instructions>
1. [Numbered, ordered, one action per step.]
2. [Edge-case handling explicitly here.]
3. [For long-doc tasks: "First, quote relevant passages in <quotes>, then answer in <answer>."]
</instructions>

<constraints>
- [Tell Claude what TO do, not what not to do.]
- [State scope explicitly.]
- [Failure behavior: "If you lack the information, respond with {"error": "insufficient_context"} — do not guess."]
</constraints>

<examples>
  <example>
    <sample_input>...</sample_input>
    <ideal_output>...</ideal_output>
    <why_good>[Specific reasons tied to constraints.]</why_good>
  </example>
</examples>

<output_format>
[Concrete schema. JSON → show the schema. Free text → "Start with a one-sentence verdict, then 2–3 bullet reasons."]
</output_format>

<user_query>
{{USER_INPUT}}
</user_query>
```

### 5. Output

Present:
1. Which track/version was chosen and why (one sentence) — for the SDLC track, include the tier.
2. The filled-in prompt, ready to copy.
3. A short list of **flagged defaults** — any fields you filled in with assumptions the user should review (max 3 bullets).

**Inline the user's input into `<user_query>`.** `$ARGUMENTS` is the concrete request the prompt will actually process — do NOT leave it as `{{USER_INPUT}}`. The placeholder only applies when the user asked you to design a reusable template (e.g., "give me a template I can reuse for different emails"). Default behavior: paste the verbatim `$ARGUMENTS` text into `<user_query>`.

If a field has no good default (e.g., you have no idea what the output schema should be), leave a `[TODO: ...]` placeholder and flag it.

## Decision guide

```
Software change (code)?  ──YES──► SDLC-flow prompt: spec → adr → tdd → implement → test → PR
         │
         NO
         │
Has long documents / variable content?  ──YES──► Full
         │
         NO
         │
Multiple steps or edge cases?  ──YES──► Full
         │
         NO
         │
Structured output schema needed?  ──YES──► Full
         │
         NO
         │
         ▼
       Minimal
```

## Example run

**User:** `/prompt-builder I need a prompt that classifies customer support emails into categories`

**Output:**

> Choosing **Minimal** — single classification step, short input, free-text category output.
>
> ```xml
> <role>You are a customer support triage agent. You classify incoming support emails into the correct category.</role>
>
> <instructions>
> 1. Read the email in <user_query>.
> 2. Assign exactly one category from this list: Billing, Technical, Account Access, General Inquiry, Complaint.
> 3. If the email fits multiple categories, choose the primary issue.
> </instructions>
>
> <constraints>
> - Output the category name only — no explanation unless asked.
> - If the email is spam or irrelevant, output: Spam.
> </constraints>
>
> <examples>
>   <example>
>     <sample_input>Hi, I was charged twice this month for my subscription.</sample_input>
>     <ideal_output>Billing</ideal_output>
>   </example>
> </examples>
>
> <user_query>{{EMAIL_TEXT}}</user_query>
> ```
>
> **Flagged defaults:**
> - Category list is assumed — replace with your actual taxonomy.
> - Output is the category name only; change `<constraints>` if you need a confidence score or explanation.

---

**User:** `/prompt-builder add rate limiting to the login endpoint in auth-service`

**Output:**

> Choosing the **SDLC-flow** track — code change; touches auth (trust boundary), single backend domain → **full workflow** tier.
>
> *(the filled `<role>/<task>/<context>/<workflow>/<constraints>/<output_format>` prompt from §4a, with slug `auth-login-rate-limit`, `<user_query>` set to the request above)*
>
> **Flagged defaults:**
> - Slug `auth-login-rate-limit` is assumed.
> - Acceptance criteria are left to be derived in stage 1 — supply them if you have them.
> - No contract change assumed (existing endpoint, new 429 behavior); say so if the OpenAPI spec must change.
