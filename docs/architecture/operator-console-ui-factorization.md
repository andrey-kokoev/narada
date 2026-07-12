# Operator Console UI Factorization

## Target

The Operator Console Site Registry UI has one canonical domain model and one explicit browser projection boundary. It does not create a second registry domain or grant authority to browser view models.

## Ownership

- `@narada2/site-registry-contract` owns browser-safe canonical registry types and runtime parsers for the snake_case HTTP/CLI envelopes.
- `@narada2/windows-site` remains the durable registry implementation and authority owner. It re-exports the canonical types for existing callers.
- `@narada2/operator-console-ui` owns ephemeral `SiteListProjection`, `SiteTileProjection`, and `SiteDetailProjection` view models, plus composables for fetch, selection, and plan/apply client state.
- Components and pages render projections; they do not read the registry database, infer authority, or bypass the plan/apply gateway.
- `@narada2/site-config` remains distinct: its registry projection contracts describe awareness and event-derived read models, not durable User Site registry rows.

## Serving Boundary

The CLI serves the built Vue document at `/console/registry` and only admits bundle assets through the bounded `/console/registry/assets/:asset` route. The existing `/console/registry/add` and `/console/registry/manage` pages remain a transitional mutation surface until their workflows are migrated into the same UI package.

## Invariants

- HTTP data is parsed at the browser boundary before projections run.
- View models are ephemeral and cannot mutate the registry.
- Selection uses the canonical response `site_id`, including when a user enters an alias.
- Plan and apply remain separate operations, with the server retaining mutation authority.
- Malformed list/show responses fail visibly instead of becoming partial UI state.

## Next Boundary

The next coherent slice is to migrate add/manage into `@narada2/operator-console-ui`, reusing the typed mutation client and preserving the existing plan/apply and purge safeguards.
