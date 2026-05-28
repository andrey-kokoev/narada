Implemented task 1511 by surfacing MCP role-policy reconciliation in startup and fabric posture.

Files changed:

- `packages/narada-proper-mcp/src/server.ts`
- `packages/narada-proper-mcp/src/surface-registry.ts`
- `packages/narada-proper-mcp/test/narada-proper-mcp.test.ts`
- `docs/concepts/narada-mcp-facade.md`
- `.ai/do-not-open/tasks/20260518-1511-wire-mcp-policy-reconciliation-into-startup-and-doctor-postu.md`

Summary:

- `agent_context_startup_sequence` now includes read-only `mcp_policy_reconciliation` posture.
- `narada_mcp_fabric_context` exposes the same reconciliation posture for doctor-style fabric inspection.
- The posture reports aligned/drift/error status, exact additions/removals, validation errors, and the source reconciler result.
- Startup does not repair or mutate config. It reports `mutation_attempted: false`, `mutation_performed: false`, and `auto_repair_performed: false`.
- The reported repair path is the explicit reconciler command: `narada-proper-mcp --site-root <siteRoot> --reconcile-mcp-policy --apply`.
- Removed a runtime ESM cycle by making `surface-registry.ts` keep an explicit exposed-tool list, with tests still comparing it to live MCP tools.
- Documented why MCP role policy should reconcile Site-local `config.json` instead of regenerating whole config.

Verification:

- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp test` passed: 1 file, 38 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` passed.
- Live startup probe against `D:\code\narada` returned `mcp_policy_reconciliation.status: aligned` with no additions/removals and no mutation.
