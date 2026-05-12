# narada-proper.task-0034: Deepen Windows Machinery Conformance Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027` through `narada-proper.task-0033`

## Goal

Deepen `@narada2/windows-machinery-capability-exchange` with:

- typed package-set conformance report descriptors;
- complete/incomplete descriptor-set status;
- missing package reporting;
- shared refusal state classes;
- source inventory documentation;
- neutral tests proving descriptor-only package-set conformance.

## Non-Goals

- No package publication.
- No receiving Site materialization.
- No live Windows machinery execution.
- No runtime DB/task/inbox/checkpoint/roster/operator-surface/PC/secrets import.

## Verification

- `pnpm --dir packages/windows-machinery-capability-exchange test`
- `pnpm --dir packages/windows-machinery-capability-exchange typecheck`
- `pnpm --dir packages/windows-machinery-capability-exchange build`

## Closeout

- Audit: `.narada/audit/task-0034-windows-machinery-conformance-slice-audit.json`
