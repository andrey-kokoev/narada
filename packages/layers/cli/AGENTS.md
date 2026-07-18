# AGENTS.md - @narada2/cli

The `narada` and `narada-mcp` binaries: all CLI commands, plus the Operator Console HTTP server that serves the workspace landing page and console browser UI. For verification ladder, naming, and task contract, read `../../../AGENTS.md` (narada-root) first. Command implementation conventions live in narada-root "Common Modifications → Add a CLI Command"; this file covers the operator-facing UI server slice.

## Operator Console / Workspace UI Slice

Commands in `src/commands/` that host browser-facing surfaces:

- `operator-workspace-page.ts` — workspace landing page (`/`); renders navigation from `projectOperatorSurfaceNavigation()` in `@narada2/operator-console-contract`, never a hand-written surface list.
- `console-server.ts` — Operator Console HTTP server (observation + audited control routing); also projects operator-router routes and ensures the console launch artifact.
- `console-server-routes.ts` — route table. GET routes are strictly read-only; mutating POSTs are the registry plan/apply boundary (via `RegistryMutationGateway`), the `ControlRequestRouter` control endpoint, and the plan-first site launch ensure (`POST /console/registry/api/sites/:id/launch` → `sitesLaunchCommand`, dry-run unless the body explicitly sets `dry_run: false`).
- `sites-launch.ts` — `sitesLaunchCommand`: ensures a Site's declared runtime posture (registry resolution, MCP surface materialization drift via `@narada2/mcp-fabric`, resident ensure via the Site's own CLI when a loop declares one, scheduler posture check, console URL). Registered as `narada sites launch <site-id>` in `sites-register.ts`.
- `console-register.ts` — CLI command registration for the console surface.
- Supporting modules in the same directory: `site-registry-read-model.ts`, `site-registry-management-gateway.ts`, `agent-session-read-model.ts`, `workspace-launch-session-store.ts`, `console-ui-assets.ts`.

Boundary rules:

- The CLI is the authority owner for both console packages (`@narada2/operator-console-ui` is presentation-only; `@narada2/operator-console-contract` holds the shared catalog). Route paths and surface descriptors come from the contract package — do not redefine them here.
- GET endpoints never mutate registry or Site state; control flows only through `ControlRequestRouter` (audited).
- The console server serves the built `operator-console` launch artifact via `ensureLaunchArtifact()`; it does not build the UI itself.

## Verification

```text
pnpm --filter @narada2/cli typecheck
pnpm --dir packages/layers/cli exec vitest run test/commands/nars.test.ts   # example focused file
```

Launcher-related verification uses `pnpm --filter @narada2/cli test:launcher:focused -- <one-test-file>` (runs typecheck first). See narada-root "Testing" for the full escalation ladder.
