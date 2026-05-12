# First Slice Extraction

This package carries the reusable descriptor and contract portion of the admitted Narada proper Site task lifecycle first slice.

## Package Boundary

`@narada2/site-task-lifecycle` remains adapter-interface-only:

- no SQLite dependency;
- no direct DB mutation;
- no source Site database, history, inbox, roster, checkpoint, operator-surface, PC-locus, secret, identity-specific, or live registration import;
- neutral fixtures only for tests.

Concrete SQLite execution belongs outside this package, in an admitted receiving-Site runtime or CLI adapter surface. The package may describe schema statements, write requests, adapter conformance expectations, MCP binding requests, and setup plans, but execution authority stays with the receiving Site.

## Proven Narada Proper Runtime Slice

Narada proper admitted the first runtime slice as local-only:

- root initialization produced a receiving-Site admission manifest;
- an admitted sqlite3 adapter performed the DB mutation outside this package;
- live MCP exposed `site_task_lifecycle.plan_init`, `site_task_lifecycle.admit_task`, and `site_task_lifecycle.read_task`;
- `read_task` proved task row, evidence refs, and admission events without mutation.

The live tools must preserve:

- `packageExecutedSqliteMutation=false`;
- `sourceStateImported=false`;
- local-only mutation gates;
- refusal of source-state references and cross-Site mutation.

## Evidence Chain

The first-slice evidence chain is:

1. admission/task audit under `.narada/audit`;
2. append-only admission ledger event under `.narada/admission/admission-ledger.jsonl`;
3. local mutation evidence under `.ai/mutation-evidence/task_lifecycle`;
4. DB readback from `.ai/task-lifecycle.db`;
5. MCP `site_task_lifecycle.read_task` proof for the admitted row and evidence refs.

## Not Claimed

The first slice does not claim richer list/query tools, richer lifecycle transitions, cross-Site mutation, OSM policy, package-owned SQLite, or arbitrary SQL execution. Each remains a separate admission.
