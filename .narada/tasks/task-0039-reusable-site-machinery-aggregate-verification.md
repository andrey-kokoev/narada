# narada-proper.task-0039: Reusable Site Machinery Aggregate Verification

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Source handoff: `C:\Users\Andrey\Narada\kb\proposals\reusable-narada-site-machinery-extraction-map-20260507.md`

## Goal

Verify the reusable Site machinery descriptor package set that now covers the extraction map's package families under Narada proper authority.

## Verified Packages

- `@narada2/site-task-lifecycle`
- `@narada2/agent-context-memory`
- `@narada2/site-inbox`
- `@narada2/site-config`
- `@narada2/site-lift`
- `@narada2/mcp-shell-windows`
- `@narada2/mcp-test-windows`
- `@narada2/windows-operator-surface`

## Verification

For each package:

- `pnpm --dir packages/<package> test`
- `pnpm --dir packages/<package> typecheck`
- `pnpm --dir packages/<package> build`

## Closeout

- Audit: `.narada/audit/task-0039-reusable-site-machinery-aggregate-verification-audit.json`
