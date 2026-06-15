# task-0008 Windows PowerShell Package Portability Admission

Decision: admitted.

Admitted root: `D:\code\narada`.

Authority basis:
- `OSM:osm_20260510_185330_862_8db62965`.
- This is a package portability/docs/tests task, not a live receiving-Site mutation task.

Admitted mutation scope:
- `packages/site-task-lifecycle` README, docs, and tests.
- `.narada` task/admission/audit/ledger evidence for task-0008.

Denied scope:
- Narada proper `.ai` live state as a reusable artifact.
- Narada-andrey runtime DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets state.
- SQLite dependency or mutation inside `@narada2/site-task-lifecycle`.
- Live MCP registration state, adapter admission records, task rows/history, richer list/query, richer transitions, cross-Site mutation, OSM policy, package-owned SQLite, or arbitrary SQL.
