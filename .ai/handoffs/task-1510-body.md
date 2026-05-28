Implemented task 1510 by adding a bounded local config MCP policy reconciler.

Files changed:

- `packages/narada-proper-mcp/src/config-policy-reconciler.ts`
- `packages/narada-proper-mcp/src/index.ts`
- `packages/narada-proper-mcp/test/narada-proper-mcp.test.ts`
- `.ai/do-not-open/tasks/20260518-1510-implement-local-config-mcp-policy-reconciler.md`
- `.ai/mutation-evidence/mcp_policy/mcp_policy_repair_2033d2c2d7d9ac03.json`

Summary:

- Added `reconcileLocalMcpRolePolicy`, which reads local `config.json`, compares the architect `narada-proper` `allowed_tools` list to the MCP role-policy projection, and reports exact additions/removals.
- Added `narada-proper-mcp --reconcile-mcp-policy` check mode and explicit `--apply` repair mode.
- Check mode is read-only, exits `1` on drift, and exits `2` on missing/malformed config policy input.
- Apply mode patches the allowed-tools subtree and records portable mutation evidence under `.ai/mutation-evidence/mcp_policy/`.
- Added tests for no drift, exact missing/stale drift, malformed config, and apply/evidence behavior.
- Ran the reconciler against this Site-local `config.json`; it removed stale `site_registry_relation_plan_transition` and the follow-up read-only check now reports no drift.

Verification:

- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp test` passed: 1 file, 35 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` passed.
- `node packages/narada-proper-mcp/dist/main.js --site-root D:\code\narada --reconcile-mcp-policy` passed after repair with status `ok`.
