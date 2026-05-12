# narada-proper.task-0007

## Title

Stabilize proven first-slice Site task lifecycle extraction.

## Authority Basis

- Operator request relayed by `narada-andrey.Kevin` in `OSM:osm_20260510_183851_655_98580115`.
- Narada proper first slice already terminal/claimable for root init, admitted sqlite3 adapter DB mutation, live MCP `plan_init`, `admit_task`, `read_task`, and evidence readback.
- This task consolidates the proven slice only; richer list/query, richer transitions, cross-Site mutation, and OSM policy remain separate admissions.

## Goal

Preserve `@narada2/site-task-lifecycle` as a pure descriptor/contract package and stabilize the Narada proper CLI/runtime MCP surface for local-only task lifecycle setup and evidence readback.

## Non-Goals

- No SQLite dependency or mutation inside `@narada2/site-task-lifecycle`.
- No narada-andrey runtime DB, task/inbox state, roster/checkpoint/operator-surface/PC/secrets state, identity-specific data, or source history import.
- No broad list/query tool, richer task transitions, cross-Site mutation, or OSM policy implementation.

## Changed-File Scope

- `packages/site-task-lifecycle` source/tests/docs.
- `packages/layers/cli/src/mcp-server.ts` and MCP server tests only if needed for local-only gates.
- `.narada` task/admission/audit/ledger evidence.

## Verification Checklist

- Package typecheck and tests pass.
- CLI MCP server tests for task lifecycle tools pass.
- Ledger remains valid JSONL.
- Audit names changed files, verification, rollback, terminal claim, and future admissions not claimed.
