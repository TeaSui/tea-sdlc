# Code Patterns Rules

- **API response envelope (mandatory for every HTTP-exposed endpoint):**
  - Success: `{ "data": {...}, "meta": {"timestamp": "..."} }`
  - Error: `{ "error": {"code": "...", "message": "...", "details": []} }`
  - Applies to all implementation agents that produce HTTP endpoints: `backend-engineer-subagent` (including model endpoints), `platform-engineer-subagent` (API Gateway + Lambda, scaffolded API gateways), and any mobile/frontend BFF produced by those agents. Pre-existing endpoints that diverge should be migrated when touched; do not introduce new shapes.
  - If a third-party contract forces a different shape (e.g., a webhook signed by a vendor), wrap it at the ingress and translate to the envelope internally.
- Error handling: try/catch at boundaries only
- Config: environment variables, no hardcoded values
- Database: repository pattern for data access
- Services: single responsibility, dependency injection
- DTOs: validate at entry points
- Static analysis: new code must pass the SonarQube "Sonar way" quality gate — see `references/sonar-way.md`
