# narada-proper.task-0035: Windows Machinery Aggregate Verification

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027` through `narada-proper.task-0034`

## Goal

Run an aggregate verification pass across the adopted Windows machinery descriptor packages and record the package-set posture.

## Verified Packages

- `@narada-core/windows-machinery-capability-exchange`
- `@narada-core/mcp-shell-windows`
- `@narada-core/mcp-test-windows`
- `@narada-core/windows-operator-surface`
- `@narada-core/windows-osl`
- `@narada-core/windows-pc-site-template`
- `@narada-core/windows-komorebi-yasb-kit`

## Verification

For each package:

- `pnpm --dir packages/<package> test`
- `pnpm --dir packages/<package> typecheck`
- `pnpm --dir packages/<package> build`

## Closeout

- Audit: `.narada/audit/task-0035-windows-machinery-aggregate-verification-audit.json`
