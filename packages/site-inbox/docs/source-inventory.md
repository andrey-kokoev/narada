# Site Inbox Source Inventory

Task: `narada-proper.task-0036`

This inventory records external orientation evidence used for the package-local Canonical Inbox first slice. The evidence is not Narada proper truth and does not admit source Site inbox runtime state.

## Considered Evidence

- `narada-proper:docs/concepts/canonical-inbox.md`
- `narada-andrey:kb/operations/inbox-read-path-architecture.md`
- `narada-andrey:kb/operations/inbox-disposition-authority-and-portability.md`
- `narada-andrey:tools/inbox/inbox-policy.mjs`
- `narada-andrey:tools/inbox/admission-log.mjs`
- `narada-andrey:tools/typed-mcp/inbox-mcp-server.mjs`
- `narada-andrey:tools/typed-mcp/inbox-admit.mjs`

## Lifted

- Inert envelope admission request and decision contracts.
- Scale-relative crossing coordinate shape.
- Portable Git-visible envelope artifact plan.
- Refusal guards for source inbox DB/history import, runtime state import, empty payloads, credentials, and unsafe source references.

## Refused

- `.ai/inbox.db` and any source inbox SQLite substrate.
- Source inbox envelope history, disposition logs, task/inbox promotion state, rosters, checkpoints, operator-surface runtime state, PC-locus state, secrets, and credentials.
- Live MCP registration, Git publication, task promotion, and local DB mutation.

## Package Claim

`@narada2/site-inbox` now carries descriptor/contracts/tests for receiving-Site Canonical Inbox first-slice admission planning. Receiving Sites still own their local inbox DB, portable envelope writes, publication, import/replay, task promotion, and evidence storage.
