# narada-proper.task-0036: Site Inbox Package First Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Source handoff: `C:\Users\Andrey\Narada\kb\proposals\reusable-narada-site-machinery-extraction-map-20260507.md`
- Source task: narada-andrey task `#445`

The source map is external orientation evidence only. Narada proper admits a package-local descriptor/contracts/tests first slice for Canonical Inbox, not source inbox runtime state.

## Goal

Create `@narada2/site-inbox` with:

- inert envelope admission request and decision contracts;
- scale-relative crossing coordinate types;
- portable envelope artifact planning;
- refusal guards for source DB/history/runtime imports, empty payloads, unsafe source refs, and credentials;
- source inventory documentation;
- neutral tests.

## Non-Goals

- No `.ai/inbox.db` creation or mutation.
- No source inbox DB or envelope history import.
- No disposition/task promotion history import.
- No live MCP registration.
- No Git publication or envelope write.
- No roster, checkpoint, operator-surface runtime, PC-locus, secret, or credential import.

## Verification

- `pnpm --dir packages/site-inbox test`
- `pnpm --dir packages/site-inbox typecheck`
- `pnpm --dir packages/site-inbox build`

## Closeout

- Audit: `.narada/audit/task-0036-site-inbox-package-first-slice-audit.json`
