# narada-proper.task-0026: Add Guarded Execute-Live Create-Site Orchestration

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on:
  - `narada-proper.task-0024`
  - `narada-proper.task-0025`

## Goal

Make the easy greenfield Site creation path coherent from the Narada CLI by allowing `narada sites create` to create the Site skeleton and then run admitted live carriers in sequence when explicitly requested.

## Implemented Command Form

```powershell
narada sites create --config <path> --format json --execute-live --live-authority-basis <basis>
```

The command:

1. validates and materializes the greenfield Site skeleton;
2. runs `site_local_db_init`;
3. runs `site_local_storage_hydration`;
4. runs `site_mcp_registration_transport` when MCP surfaces are present;
5. runs `windows_profile_site_binding` as a target-local profile binding artifact when Windows profile guidance is requested.

## Guardrails

- `--execute-live` is refused in dry-run mode.
- `--execute-live` requires `--live-authority-basis`.
- Carrier apply still uses explicit `mutation_authorized`.
- No source Site runtime state is imported.
- Private MCP client config mutation and real Windows profile mutation outside the target Site remain non-claims.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts`
- `pnpm --dir packages/layers/cli typecheck`

## Terminal Claim

Narada proper now supports a greenfield create-Site CLI path that can create a Site from Narada proper templates and run the admitted local live setup carriers under explicit authority.
