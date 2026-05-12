# narada-proper.task-0035: Windows Machinery Aggregate Verification

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027` through `narada-proper.task-0034`

## Goal

Run an aggregate verification pass across the adopted Windows machinery descriptor packages and record the package-set posture.

## Verified Packages

- `@narada2/windows-machinery-capability-exchange`
- `@narada2/mcp-shell-windows`
- `@narada2/mcp-test-windows`
- `@narada2/windows-operator-surface`
- `@narada2/windows-osl`
- `@narada2/windows-pc-site-template`
- `@narada2/windows-komorebi-yasb-kit`

## Verification

For each package:

- `pnpm --dir packages/<package> test`
- `pnpm --dir packages/<package> typecheck`
- `pnpm --dir packages/<package> build`

## Closeout

- Audit: `.narada/audit/task-0035-windows-machinery-aggregate-verification-audit.json`
