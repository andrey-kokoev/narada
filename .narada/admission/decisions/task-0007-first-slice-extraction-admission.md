# task-0007 First-Slice Extraction Admission

Decision: admitted.

Admitted root: `D:\code\narada` as the explicit task-0007 Narada proper implementation root under the already admitted task-0001 carrier lineage.

Authority basis:
- Operator request `OSM:osm_20260510_183851_655_98580115`.
- Prior accepted terminal first slice recorded in `.narada/audit/task-0006-terminal-first-slice-assessment.json`.
- Scope is consolidation of already proven first-slice source/tests/docs/evidence, not expansion to richer task lifecycle behavior.

Admitted mutation scope:
- `packages/site-task-lifecycle` package docs/tests needed to document and prove the extraction posture.
- `packages/layers/cli/test/commands/mcp-server.test.ts` for local-only MCP refusal coverage.
- `.narada/tasks`, `.narada/admission`, `.narada/audit` append/update evidence for task-0007.

Denied scope:
- Narada-andrey runtime DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets state.
- SQLite dependency inside `@narada2/site-task-lifecycle`.
- Package-owned DB mutation.
- Cross-Site mutation and richer list/query/transitions.
