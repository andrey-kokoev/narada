# narada-proper.task-0008

## Title

Make the first Site task lifecycle slice reusable by future Windows PowerShell Narada Sites from the repo package.

## Authority Basis

- Operator request relayed by `narada-andrey.Kevin` in `OSM:osm_20260510_185330_862_8db62965`.
- Prior terminal first-slice extraction stabilization: `narada-proper.task-0007`.

## Goal

Document and verify that future Windows PowerShell Narada Sites consume `@narada2/site-task-lifecycle` from `narada/packages/site-task-lifecycle` as reusable descriptor/contract source, then admit their own local adapter/runtime state.

## Non-Goals

- Do not copy Narada proper live Site state into future Sites.
- Do not copy `.ai/task-lifecycle.db`, admission manifests, mutation evidence, task rows/history, live MCP registration state, adapter admission records, or narada-andrey/narada-proper runtime state.
- Do not add SQLite dependency or mutation to `@narada2/site-task-lifecycle`.
- Do not implement richer list/query, richer transitions, cross-Site mutation, OSM policy, package-owned SQLite, or arbitrary SQL.

## Changed-File Scope

- `packages/site-task-lifecycle` README/docs/tests.
- `.narada` task/admission/audit/ledger evidence.

## Verification Checklist

- Package typecheck and tests pass.
- Package build passes.
- Audit records changed files, verification, rollback, terminal claim, and future admissions not claimed.
