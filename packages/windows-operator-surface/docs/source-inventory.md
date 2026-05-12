# Windows Operator Surface Source Inventory

Source evidence from narada-andrey was reviewed as orientation only.

## Portable Source

- `docs/concepts/operator-surface-identity-ledger.md`: identity ledger event vocabulary and registry/ledger/runtime-binding separation.
- `docs/concepts/operator-surface-task-activity.md`: task activity projection boundary between task lifecycle, operator-surface binding authority, and OSL rendering.
- `tools/operator-surface/operator-surface-binding-services.mjs`: pure binding diagnosis and projection functions, after removing source-local path authority.

## Portable Templates Requiring Parameters

- `kb/operator-surface/operator-surface-health-taxonomy.md`
- `kb/operator-surface/osl-webview2-panel-payload-contract.md`
- `kb/operator-surface/runtime-binding-mutable-json-vs-ledger.md`

## Fixture-Only Examples

- `tools/operator-surface/*.test.mjs` where tests use fake identities, fake HWND values, and no PC runtime DB.
- `kb/operator-surface/yasb-*` documents when they describe health categories rather than live desktop state.

## Local Runtime Authority Excluded

- Live HWND bindings.
- Operator-surface SQLite databases.
- Generated projections under `C:\ProgramData\Narada`.
- Live window/process evidence.
- `narada-andrey.Kevin`, `narada-andrey.Bob`, and other narada-andrey identities as authority.
- PC-locus repair scripts and native Windows API mutation scripts.

## Adoption Decision

Narada proper admits only descriptor contracts and fixture-safe pure service functions in this slice. Receiving Sites must supply their own authority records, observations, runtime DBs, and MCP/PC mutation carriers.
