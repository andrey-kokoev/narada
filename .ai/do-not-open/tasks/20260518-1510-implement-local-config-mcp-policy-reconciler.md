---
status: confirmed
depends_on: [1508]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T15:47:01.981Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T15:47:02.473Z
closed_by: narada.builder
governed_by: chapter_close:narada.architect
closure_mode: agent_finish
---

# Implement local config MCP policy reconciler

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1509-1511-mcp-policy-reconciliation.md

## Goal

Implement a bounded reconciler that compares local config.json against the expected MCP role-policy projection and can apply a narrow patch only to the governed allowed_tools subtree.

## Context

Narada doctrine favors reconciliation over broad generation for Site-local runtime config. The reconciler should compute additions/removals from the projection contract, report exact drift, and optionally apply only the narada-proper architect allowed_tools patch with evidence.

## Required Work

1. Add a reconciler library or CLI command that reads local config.json and the expected MCP policy projection.
2. Support read-only check mode returning exact additions and removals with a nonzero exit on drift.
3. Support an explicit repair/apply mode that patches only mcp.role_policies.architect.servers["narada-proper"].allowed_tools.
4. Emit bounded mutation evidence or an equivalent Git-visible repair report for applied local config changes.
5. Add tests for no-drift, missing tool, stale tool, malformed config, and narrow-patch behavior.

## Non-Goals

- Do not edit unrelated config.json fields.
- Do not read secrets, credentials, or private runtime state.
- Do not bypass target-locus checks for config mutation.

## Execution Notes

- Added `packages/narada-proper-mcp/src/config-policy-reconciler.ts` with a bounded local config reconciler for `mcp.role_policies.architect.servers["narada-proper"].allowed_tools`.
- Added `narada-proper-mcp --reconcile-mcp-policy` check mode and explicit `--apply` repair mode. The command reads the package MCP role-policy projection, reports exact additions/removals, and exits `1` on drift and `2` on malformed/missing config.
- Repair mode mutates only the allowed-tools subtree semantically and emits portable mutation evidence under `.ai/mutation-evidence/mcp_policy/`.
- Exported the reconciler API from `packages/narada-proper-mcp/src/index.ts`.
- Added tests for no drift, exact missing/stale drift, malformed config, and apply/evidence behavior.
- Ran the reconciler against this Site-local `config.json`. The first read-only run found stale `site_registry_relation_plan_transition`; explicit apply removed it and wrote `.ai/mutation-evidence/mcp_policy/mcp_policy_repair_2033d2c2d7d9ac03.json`.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp test` passed: 35 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` passed.
- `node packages/narada-proper-mcp/dist/main.js --site-root D:\code\narada --reconcile-mcp-policy` initially reported drift: removals `["site_registry_relation_plan_transition"]`.
- `node packages/narada-proper-mcp/dist/main.js --site-root D:\code\narada --agent-id narada.builder --reconcile-mcp-policy --apply` repaired that stale tool and emitted mutation evidence.
- Follow-up `node packages/narada-proper-mcp/dist/main.js --site-root D:\code\narada --reconcile-mcp-policy` passed with status `ok`, no additions/removals, and exit code `0`.

## Acceptance Criteria

- [x] Read-only reconciler mode reports no drift after task 1508's local config alignment.
- [x] Synthetic drift fixtures produce exact additions/removals.
- [x] Repair mode changes only the allowed_tools subtree and records portable evidence.
