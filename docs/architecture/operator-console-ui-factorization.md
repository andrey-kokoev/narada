# Operator Console UI Factorization

## Target

The Operator Console Site Registry UI has one canonical domain model and one explicit browser projection boundary. It does not create a second registry domain or grant authority to browser view models.

## Ownership

- `@narada2/site-registry-contract` owns browser-safe canonical registry types and runtime parsers for the snake_case HTTP/CLI envelopes.
- `@narada2/windows-site` remains the durable registry implementation and authority owner. It re-exports the canonical types for existing callers.
- `@narada2/operator-console-ui` owns ephemeral `SiteListProjection`, `SiteTileProjection`, and `SiteDetailProjection` view models, plus composables for fetch, selection, and plan/apply client state.
- The site-registry domain module owns typed draft, operation, validation, request-builder, and diff-row contracts. It adapts the canonical contract for browser workflows without becoming a second authority model.
- `useSiteRegistry` owns list/detail retrieval and presentation projections; `useSiteRegistryMutation` owns one plan/apply gateway; `useSiteRegistryWorkflow` composes them into draft, lifecycle, route, and confirmation state.
- Components and pages render projections and wire events to the workflow composable; they do not read the registry database, infer authority, or bypass the plan/apply gateway.
- `@narada2/site-config` remains distinct: its registry projection contracts describe awareness and event-derived read models, not durable User Site registry rows.

## Serving Boundary

The CLI serves the same built Vue document at `/console/registry`, `/console/registry/add`, `/console/registry/manage`, and `/console/launch`. The bundle is mounted at the neutral `/console/assets/:asset` path; Site Registry remains the canonical console entry and does not own the application bundle. The mutation page selects its initial mode from the request path; it does not create a second app.

## Invariants

- HTTP data is parsed at the browser boundary before projections run.
- View models are ephemeral and cannot mutate the registry.
- Selection uses the canonical response `site_id`, including when a user enters an alias.
- Plan and apply remain separate operations, with the server retaining mutation authority.
- Malformed list/show responses fail visibly instead of becoming partial UI state.

## Shared Console Boundary

`@narada2/operator-console-contract` owns typed `OperatorSurfaceDescriptor`
records and the availability projection for Registry, Launcher, and future
concepts. `console/routes.ts` maps those records into the browser route model
and navigation items. The CLI workspace directory uses the same projection,
so a surface cannot be available in one ingress view and absent from the other
because of a duplicated list. The route-neutral `OperatorSurfaceShell` lives
in `@narada2/ui-vue`; `OperatorConsoleShell.vue` is the console-specific
type-safe wrapper. Shared framing leaves domain state to page composables.
Unknown paths render a bounded not-found projection instead of silently
falling back to the registry.

The launcher is a separate `@narada2/workspace-launch-ui` presentation package. Its `domain.ts` adapter, typed `transport.ts`, and `useWorkspaceLaunchWorkflow` own client state while `@narada2/cli` remains the authority for launch policy, runtime handoff, and endpoint behavior. The transport accepts an explicit base path so the same page can run at the standalone root or a mounted route without endpoint drift.

The console route `/console/launch` is intentionally a router for persistent CLI-owned sessions. The CLI session store exposes the read-only session-list projection, and the UI reaches it through a typed transport and composable before linking to a stable console session route. The console route proxies only active loopback launcher sessions and known launcher paths, rewriting the bootstrap and asset prefix while leaving launch authority in the CLI. This preserves the boundary `contract -> transport -> adapter -> composable -> page -> projection` without introducing a generic page registry.

The concept-to-page map is maintained in `docs/architecture/operator-console-concept-surfaces.md`.

The console server is also the first managed router projection. Normal
`narada console serve` uses the configured default loopback port `61729`,
probes `/health` for matching identity, attaches to a healthy existing
instance, and refuses foreign ownership. `--port 0` remains an explicitly
diagnostic ephemeral mode. Full hidden-process singleton management and
dynamic route leases remain later router slices.
