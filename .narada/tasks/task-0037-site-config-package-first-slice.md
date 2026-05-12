# narada-proper.task-0037: Site Config Package First Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Source handoff: `C:\Users\Andrey\Narada\kb\proposals\reusable-narada-site-machinery-extraction-map-20260507.md`
- Source task: narada-andrey task `#445`

The source map and site-config docs/tools are external orientation evidence only. Narada proper admits descriptor/contracts/tests for Site registry awareness and read-only registered Site probe posture, not target Site mutation authority.

## Goal

Create `@narada2/site-config` with:

- known-Site registry entry contracts;
- explicit capability edge and capability denial types;
- registry validation decision shape;
- registered Site probe request/report descriptors;
- refusal guards for unregistered roots, target mutation, arbitrary scans, runtime state import, and credentials;
- source inventory documentation;
- neutral tests.

## Non-Goals

- No target Site config mutation.
- No live probe execution.
- No arbitrary client/project data scan.
- No target task/inbox DB, history, deployment, trust record, secret, credential, or runtime state import.
- No relationship labels as capability inheritance.

## Verification

- `pnpm --dir packages/site-config test`
- `pnpm --dir packages/site-config typecheck`
- `pnpm --dir packages/site-config build`

## Closeout

- Audit: `.narada/audit/task-0037-site-config-package-first-slice-audit.json`
