# narada-proper.task-0014

Title: Emit package-slice local admission artifacts during Site creation

Goal:
- Let create-site materialize descriptor/admission artifacts for selected package slices without executing DB, MCP, hydration, or capability grants.

Acceptance:
- Agent-memory and task-lifecycle presets can write local descriptor/admission manifests.
- Generated files state which live setup steps are still required.
- No package-owned SQLite, no live MCP registration, no runtime hydration.

Blocked by:
- task-0013 shared template catalog.
