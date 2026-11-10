# AI Integration Rules

## Sources of truth (live, never vendored)
Claude API details change faster than any local copy. Use, in this order:
1. Claude Code's built-in **`/claude-api`** skill (ships and updates with Claude Code; auto-loads when code imports `anthropic` / `@anthropic-ai/sdk`; subcommands for migration, SDK upgrades, cost and evals).
2. Official docs, read live: append `.md` to any page (e.g. https://platform.claude.com/docs/en/models/overview.md); index at https://platform.claude.com/llms.txt; docs MCP server at https://platform.claude.com/docs/mcp; Context7 library `/websites/platform_claude_en` (confirm with `resolve-library-id`).
3. The installed SDK's source and changelog (`anthropic-sdk-python`, `anthropic-sdk-typescript`).
Never answer API shapes, model IDs, prices or limits from memory or from an old snippet.

## Model Selection
- Selection policy: `references/model-guide.md`. Start an unspecified substantial workload on the latest Opus at medium effort; latest Sonnet for clear bounded implementation; latest Haiku for measured mechanical/volume tasks; latest Fable for difficult reasoning and long autonomous work.
- Validate quality, latency and cost on representative cases; keep a concise rationale where a choice is non-obvious. Do not impose historical model/effort defaults on current tasks.

## Model IDs in code
Every Claude API model ID is a fixed snapshot (dateless IDs included); current models have no `-latest` alias. So "use the latest model" means *resolve it, then pin it in config*:
- Resolve: `GET /v1/models?lifecycle=active` (SDK `client.models.list()`) lists newer releases first; take the first entry whose `line` equals the wanted family (`opus`, `sonnet`, `haiku`, `fable`). Read `line` and `capabilities`, never parse the ID. Newest is not automatically recommended — check the models overview for the family's intended use.
- Pin: store the resolved ID in configuration (env var / config file), never as a literal scattered through code, so an upgrade is a one-line, reviewed change.
- Upgrade deliberately: before switching, read the target's migration guide (via `/claude-api migrate` or the docs), re-run evals, and compare cost/latency. Monitor `lifecycle`, `deprecated_at` and `retires_at` from the Models API (e.g. a scheduled check) so retirement never surprises production.
- Never invent date-suffixed IDs or assume a provider (Bedrock, Vertex, Foundry) serves the same ID as the first-party API.

## Prompt Engineering Standards
- Store prompts as versioned constants, not inline strings
- Use XML tags for structured input sections (`<context>`, `<instructions>`, `<examples>`)
- Include few-shot examples for complex output formats
- Separate system prompt (behavioral instructions) from user prompt (task data)
- Prompts must be testable — each prompt needs a golden test set

## Prompt Versioning
```typescript
// WRONG
const prompt = `Analyze this transaction: ${data}`;

// RIGHT
const TRANSACTION_ANALYSIS_PROMPT_V2 = `
<instructions>
Analyze the financial transaction and classify it.
Return JSON with fields: category, risk_level, confidence.
</instructions>
<examples>...</examples>
<transaction>{{TRANSACTION_DATA}}</transaction>
`;
```

## Cost Guardrails
- Set `max_tokens` explicitly on every API call — never rely on model default
- Implement per-user and per-service token budgets
- Log token usage with every request (input tokens, output tokens, cost estimate)
- Alert when daily cost exceeds threshold ($10 dev, $50 staging, $200 prod)
- Use prompt caching for repeated context (system prompts, documents) — up to 90% cost reduction
- Batch requests where latency allows (Anthropic Batch API)

## Context Management
- Context window is finite — design for it
- For RAG: retrieve only what's needed, rank by relevance, limit to top-k chunks
- For long documents: chunk and summarize rather than stuffing full content
- For agents: keep prior turns/system/tools stable under preserved thinking; use documented compaction/edit controls for long sessions
- For PII handling with LLMs: see `data-privacy-patterns.md` (LLM/AI Usage with PII section)

## Adaptive Reasoning
- Current models use adaptive reasoning. Control depth with documented effort; fixed thinking budgets are rejected on the current family.
- Current Fable and Opus models cannot turn thinking off. Use lower effort for mechanical work where quality holds, instead of adding prose that asks the model not to think.
- Keep request output budgets adequate for thinking plus response. Re-baseline quality/cost when changing models rather than copying prior-generation tuning.

## Prompt Caching
- Cache system prompts that are used repeatedly and exceed the model's minimum cacheable length (check the live prompt-caching docs)
- Cache retrieved documents in RAG pipelines
- Use `cache_control: {"type": "ephemeral"}` on cacheable blocks
- Monitor cache hit rate — target >80% for repeated prompts

## Evaluation Requirements
- Every AI feature must have a golden dataset of ≥20 input/output pairs
- Define quality metrics before implementation (accuracy, F1, BLEU, human eval)
- Run evals in CI on every prompt change
- Minimum passing thresholds: accuracy ≥85%, no regression vs baseline
- Use promptfoo or custom eval harness — no vibes-based quality assessment

## Security Rules
- Sanitize all user input before embedding in prompts
- Never execute LLM output directly — parse and validate first
- Use structured outputs (JSON mode, tool use) for action-bearing responses
- Implement output validation: type checking, range checking, business rule validation
- Log all LLM interactions for audit (but redact PII before logging)
- Rate limit LLM endpoints per user: 60 requests/minute default

## Error Handling
```typescript
// Required error handling pattern
try {
  const response = await anthropic.messages.create({ ... });
  return parseAndValidate(response);
} catch (error) {
  if (error instanceof Anthropic.RateLimitError) {
    // Exponential backoff with jitter
    await delay(calculateBackoff(attempt));
    return retry(attempt + 1);
  }
  if (error instanceof Anthropic.APIError && error.status >= 500) {
    // Service error — fail gracefully
    logger.error('LLM service error', { error, correlationId });
    return fallback();
  }
  throw error; // Unknown errors bubble up
}
```

## Agent Design
- Define clear tool interfaces — ambiguous tool descriptions cause errors
- Implement max iteration limits (default: 10 turns)
- Implement token budget limits per agent run
- Use structured tool outputs (JSON) — never free-form text for actions
- Log tool names, status, latency and usage; redact sensitive arguments/results before diagnostic capture
- Design for partial failure — agents must handle tool errors gracefully

## Observability
- Trace every LLM call with correlation ID linking to user request
- Emit metrics: latency P50/P95/P99, token counts, cost, cache hit rate, error rate
- Use the project observability stack in `observability-patterns.md`; introduce another vendor only within the approved architecture/security scope
- Alert on: error rate >5%, latency P99 >10s, daily cost >threshold
