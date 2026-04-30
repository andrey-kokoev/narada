---
status: claimed
---

# Document MCP runtime locus under execution-machine Site

## Goal

Reflect the policy that MCP server launch/supervision belongs to the top-level execution machine Site, while target Sites expose MCP facade contracts and authority posture.

## Context

Operator asked whether MCP should be run by the executive/runtime locus such as narada-andrey User/PC Site. Policy: Narada proper defines facade contracts; the User/PC Site that hosts local agent clients launches and supervises narada-mcp processes. On Windows this is the PC Site or User Site, not an always-on daemon owned implicitly by every target Site.

## Required Work

1. Update Narada MCP facade docs to distinguish facade contract ownership from runtime process supervision. 2. State the constitutional rule: execution-machine Site launches/supervises MCP channels; target Site admits consequences and exposes authority posture. 3. Update Windows/User/PC Site onboarding docs or MCP setup docs so Windows PC/User Site is the recommended locus for narada-mcp client config, process launch, health checks, and lifecycle supervision. 4. Clarify that per-Site MCP is a Site-scoped facade address, not an instruction to run an unbounded swarm of persistent daemons. 5. Add a small operator-facing configuration example showing User/PC Site launching narada-mcp for Narada proper. 6. Preserve MCP's facade-only posture: it must not bypass target Site authority, evidence, or crossing regimes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Docs state that the execution-machine Site owns MCP process launch and supervision.
- [ ] Docs state that target Sites own authority admission and facade contract, not local runtime supervision by default.
- [ ] Windows guidance names PC Site/User Site as the natural MCP runtime manager.
- [ ] MCP docs avoid implying an unbounded always-on server per Site.
- [ ] Example config shows narada-mcp for Narada proper launched from the local execution-machine context.
