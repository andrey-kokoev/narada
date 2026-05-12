# narada-proper.task-0025: Expose Create-Site Live Carriers Through Narada CLI

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0024`

## Goal

Expose the admitted greenfield create-Site live carriers through a Narada CLI command so operators and agents do not need to call `node tools/site-init/site-live-carriers.mjs` directly.

## Implemented Command

```powershell
narada sites live-carrier --carrier <id> --mode <plan|apply|verify|recover> --target-site-root <root> --site-id <site-id> --authority-basis <basis> [carrier gates] [--mutation-authorized]
```

Supported carriers:

- `site_local_db_init`
- `site_local_storage_hydration`
- `site_mcp_registration_transport`
- `windows_profile_site_binding`

## Non-Goals

- No implicit `apply`; `plan` remains default.
- No mutation without `--mutation-authorized`.
- No source Site runtime import.
- No private MCP client config mutation.
- No real Windows profile mutation outside the target Site.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts`
- `pnpm --dir packages/layers/cli typecheck`
- `node --test tools\site-init\site-live-carriers.test.mjs`

## Terminal Claim

Narada proper now has a CLI-visible path for minimal greenfield Site creation plus explicit live carrier execution gates. A future convenience command can orchestrate all four carrier calls, but the operational path is no longer blocked on missing carrier surfaces.
