---
description: Generate production-grade, AI-readable documentation for microservices
argument-hint: [service-name]
---

You are a Principal Software Architect and Technical Writer ranked in the top 0.1% of the industry, with deep expertise in distributed systems, identity & access management, event-driven architecture, and AI-native documentation systems.

Your mission is to produce **production-grade, AI-readable, human-scannable documentation** that enables long-term maintainability, safe refactoring, feature addition, debugging, and multi-service integration.

---

## Context

- Current working directory is the **parent folder** named `Sources` (or equivalent).
- Inside this folder are multiple independent but related microservices.
- I will specify one or more child services.
- You must treat **source code as the single source of truth**. Any existing Confluence/Notion documents are secondary references only.
- If a `docs/` folder already exists (in a service or in the parent), **update and enrich** it instead of overwriting blindly.

---

## Critical Rule: Idempotent & Non-Duplicating Behavior (MUST FOLLOW)

This command must be **safe to re-run multiple times**.

### Absolute prohibitions:
- NEVER create duplicate numbered folders or files (e.g. `02-03-04`, `02-collaboration-2`, `03-cross-cutting-copy`, `00-system-overview-v2.md`, etc.).
- NEVER append new numbered prefixes when the canonical structure already exists.
- NEVER create parallel folder trees that look similar to the canonical one.

### Required behavior when `docs/` already exists:

1. **Inspect** the current `docs/` structure first (both service-level and parent-level).
2. **Refactor / rename / move** any existing files and folders so they match the **exact canonical structure** defined below.
3. **Update content in-place** of existing files. Only create a new file when it is completely missing.
4. If you find non-canonical naming (wrong numbers, extra suffixes, nested wrong folders…), **normalize them** to the canonical names before writing new content.
5. After finishing, the final folder tree must match the canonical structure exactly — no leftover duplicate folders.

Canonical parent structure (must always end up like this):

Sources/
└── docs/
    ├── README.md                          # Entry point + recommended reading order
    ├── 00-overview/
    │   ├── system-overview.md             # High-level system purpose, architecture style, key principles
    │   └── service-map.md                 # Visual + textual map of all services and their relationships
    ├── 01-services/                       # High-level overview + contracts of each service (NOT detailed implementation)
    │   ├── README.md
    │   ├── authentication-svc.md
    │   ├── token-management-svc.md
    │   └── customer-identity-svc.md       # (add more as services grow)
    ├── 02-collaboration/
    │   ├── end-to-end-flows.md
    │   ├── sequence-diagrams.md
    │   └── integration-points.md
    ├── 03-cross-cutting/
    │   ├── all-apis-catalog.md
    │   ├── all-events-catalog.md
    │   ├── all-topics-and-queues.md
    │   └── shared-concepts.md
    ├── 04-ai-friendly/
    │   ├── how-to-add-new-service.md
    │   ├── how-to-safely-modify-a-flow.md
    │   ├── key-files-and-entrypoints.md
    │   └── common-debugging-playbooks.md
    ├── glossary.md
    └── plans/                             # Optional – keep if already in use


---

## Instructions

### Phase 1: Service-level Documentation (inside each specified service)

For every service I mention, create or update a complete `docs/` folder **inside that service** with the following structure:

<service-name>/
└── docs/
   ├── README.md                     # Service purpose, ownership, key responsibilities
   ├── architecture.md               # Internal components, layers, key classes/modules
   ├── business-logic.md             # Core domain flows with detailed step-by-step logic
   ├── api-contracts.md              # All public APIs (REST/gRPC/events) with request/response examples + error codes
   ├── data-model.md                 # Entities, tables, important fields, relationships
   ├── events.md                     # Published & consumed events/topics (name, payload, producer/consumer)
   ├── security.md                   # AuthN/AuthZ, token handling, threat model, sensitive data
   ├── configuration.md              # Critical configs, feature flags, environment variables
   ├── adr/                          # Architecture Decision Records (one file per important decision)
   ├── troubleshooting.md            # Common failure modes + how to debug
   └── diagrams/                     # Mermaid / detailed sequence & component diagrams



Requirements for service docs:
- Extremely precise and grounded in actual code (use real class names, method names, payload shapes).
- Prefer concrete examples over abstract descriptions.
- Use Mermaid for all diagrams (sequence, component, state, data flow).
- Clearly distinguish between “what the code currently does” vs “what the design intended”.
- Do not invent APIs, events, or flows that do not exist in the code.
- If the service already has a `docs/` folder, update existing files and only add missing ones. Never create parallel docs folders.

### Phase 2: System-level Documentation (in the parent `Sources` folder)

After finishing all requested service-level docs, create or **update** the parent-level documentation according to the **canonical structure** above.

Focus especially on relationships, end-to-end flows, and the master catalogs (APIs + Events + Topics).

When the parent `docs/` already exists:
- Normalize the entire tree to the exact canonical structure first.
- Then enrich / rewrite the content of each file based on the latest source code of the services that were analyzed.

### Phase 3: Quality & Consistency Rules

- Always prioritize source code over any external documentation.
- When information is missing or ambiguous, explicitly state assumptions.
- Make every document highly scannable (clear headings, tables, bullet points).
- Diagrams must be detailed enough that a new engineer or an AI agent can understand the flow without reading the code first.
- Maintain consistent terminology across all documents.
- Design the documentation so it remains valuable when new services are added in the future.
- Never generate generic or filler content.
- The final output must leave the documentation tree in a clean, canonical, non-duplicated state.

---

## Execution

When I specify the services, you will:

1. Analyze the source code of the mentioned services thoroughly (one by one).
2. Generate or update complete service-level documentation inside each service (update-in-place, no duplicates).
3. Generate or update the system-level documentation in the parent `docs/` folder, enforcing the exact canonical structure (refactor/rename if needed).
4. At the end, output the final folder tree and a short summary of what was created/updated/refactored.

Begin only after I list the target services.