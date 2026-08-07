# narada-proper.task-0039: Reusable Site Machinery Aggregate Verification

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `<src-root>\narada`
- Source handoff: `C:\Users\Andrey\Narada\kb\proposals\reusable-narada-site-machinery-extraction-map-20260507.md`

## Goal

Verify the reusable Site machinery descriptor package set that now covers the extraction map's package families under Narada proper authority.

## Verified Packages

- `@narada-core/site-task-lifecycle`
- `@narada-core/agent-context-memory`
- `@narada-core/site-inbox`
- `@narada-core/site-config`
- `@narada-core/site-lift`
- `@narada-core/mcp-shell-windows`
- `@narada-core/mcp-test-windows`
- `@narada-core/windows-operator-surface`

## Verification

For each package:

- `pnpm --dir packages/<package> test`
- `pnpm --dir packages/<package> typecheck`
- `pnpm --dir packages/<package> build`

## Closeout

- Audit: `.narada/audit/task-0039-reusable-site-machinery-aggregate-verification-audit.json`
