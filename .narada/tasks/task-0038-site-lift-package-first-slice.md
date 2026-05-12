# narada-proper.task-0038: Site Lift Package First Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Source handoff: `C:\Users\Andrey\Narada\kb\proposals\reusable-narada-site-machinery-extraction-map-20260507.md`
- Source task: narada-andrey task `#445`

The source map and Site-lift tools/docs are external orientation evidence only. Narada proper admits descriptor/contracts/tests for advisory Site-lift catalog and adoption packet posture, not source or receiving Site mutation authority.

## Goal

Create `@narada2/site-lift` with:

- advisory artifact descriptor contracts;
- adoption plan contracts;
- adoption command packet contracts;
- refusal posture for runtime databases, histories, rosters, checkpoints, operator-surface runtime, PC-locus state, secrets, credentials, and implicit live authority;
- source inventory documentation;
- neutral tests.

## Non-Goals

- No live Site-lift MCP server implementation.
- No file copy/install/bootstrap/registration.
- No source catalog runtime state import.
- No receiving Site mutation authority.

## Verification

- `pnpm --dir packages/site-lift test`
- `pnpm --dir packages/site-lift typecheck`
- `pnpm --dir packages/site-lift build`

## Closeout

- Audit: `.narada/audit/task-0038-site-lift-package-first-slice-audit.json`
