# narada-proper.task-0027: Adopt Windows Machinery Package Set First Slices

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Source envelope: `env_62d32705-0386-4820-8013-47a70cfbc8dd`
- Source artifact: `C:\Users\Andrey\Narada\kb\proposals\narada-proper-windows-machinery-capability-exchange-offer.md`
- Source task/commit: `narada-andrey task #611`, commit `bc5ecc42`

The narada-andrey packet is external evidence. Narada proper admits only descriptor/contracts/docs/tests first slices and does not import runtime authority state.

## Decision

Accepted package-set direction and adopted all proposed packages one at a time as descriptor-only first slices under the local Narada package namespace:

1. `@narada-core/windows-machinery-capability-exchange`
2. `@narada-core/mcp-shell-windows`
3. `@narada-core/mcp-test-windows`
4. `@narada-core/windows-operator-surface`
5. `@narada-core/windows-osl`
6. `@narada-core/windows-pc-site-template`
7. `@narada-core/windows-komorebi-yasb-kit`

## Non-Goals and Refusals

- No PC runtime SQLite databases.
- No live HWND bindings.
- No generated runtime projections from `C:\ProgramData\Narada`.
- No logs, PIDs, socket paths, monitor IDs, display IDs, or live Komorebi/YASB state.
- No narada-andrey identity authority.
- No secrets or credentials.
- No live shell authority, private MCP client mutation, task lifecycle mutation, external publication authority, or PC-locus mutation.

## Verification

Each adopted package passed:

- `pnpm --dir <package> test`
- `pnpm --dir <package> typecheck`
- `pnpm --dir <package> build`

## Closeout

- Audit: `.narada/audit/task-0027-windows-machinery-package-set-adoption-audit.json`
- Capability record: `.narada/capabilities/windows-machinery-capability-exchange.json`
