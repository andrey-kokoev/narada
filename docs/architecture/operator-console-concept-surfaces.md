# Operator Console Concept Surfaces

## Purpose

A domain concept earns a UI surface through an explicit chain:

1. A canonical contract defines the durable or wire shape.
2. A typed transport and domain adapter parse and name that shape for the client.
3. A composable owns request state, workflow state, and command semantics.
4. A page chooses the route-level composition.
5. Components render stable projections of the concept.

The browser is a projection and workflow client. It is not a second authority model.

## Operator Surface Catalog

`@narada2/operator-console-contract` owns the UI-neutral
`OperatorSurfaceDescriptor` records for the console concepts. Each descriptor
names its concept, scope, owner, routes, default availability, and bounded
operator handoff. `projectOperatorSurfaceCatalog` adds current availability
without changing the descriptor authority. The CLI workspace directory and
the Vue route/navigation model both consume this catalog; neither maintains a
parallel list.

The route-directory failure and recovery behavior is part of this contract,
not incidental page bootstrap behavior. See
[`operator-workspace-target.md`](operator-workspace-target.md#route-directory-recovery-semantics)
for the target semantics and
[`../product/operator-console-runbook.md`](../product/operator-console-runbook.md)
for operator recovery.

The catalog is a route and concept contract, not a generic page registry. A
concept still earns a page through the contract, transport, adapter,
composable, page, and projection chain below.

## Current Map

### User Site Registry

| Concern | Owner |
| --- | --- |
| Canonical data and request envelopes | `@narada2/site-registry-contract` |
| Durable registry authority | `@narada2/windows-site` |
| Browser domain types and validation | `operator-console-ui/src/site-registry/domain.ts` |
| Browser HTTP transport | `operator-console-ui/src/site-registry/transport.ts` |
| Browser contract adapter | `operator-console-ui/src/site-registry/adapter.ts` |
| Read and detail state | `useSiteRegistry` |
| Mutation state | `useSiteRegistryMutation` |
| Draft, operation, confirmation, and route workflow | `useSiteRegistryWorkflow` |
| Shared console chrome and route resolution | `@narada2/ui-vue` `OperatorSurfaceShell`, `OperatorConsoleShell.vue`, `console/routes.ts`, `@narada2/operator-console-contract` |
| Collection page | `/console/registry` |
| Add workflow | `/console/registry/add` |
| Manage workflow | `/console/registry/manage` |
| Repeated projection | `SiteTileProjection` rendered by the registry page |
| Detail projection | `SiteDetailProjection` rendered in the selected-site region |

The registry page is a collection and selection surface. Add and manage are separate workflow pages. They reuse the same domain and server plan/apply gateway, but they do not merge collection browsing and mutation into one page.

### Workspace Launch

| Concern | Owner |
| --- | --- |
| Canonical launch selector and dashboard wire types | `@narada2/workspace-launch-contract` |
| Launch authority and HTTP endpoints | `@narada2/cli` |
| Browser domain adapter | `workspace-launch-ui/src/launcher/domain.ts` |
| Typed browser transport and base-path binding | `workspace-launch-ui/src/launcher/transport.ts` |
| Selection, submit, cancel, retry, and dashboard state | `useWorkspaceLaunchWorkflow` |
| Launcher presentation | `workspace-launch-ui/src/App.vue` |
| Repeated projection | Launch attempt cards and stage rows |
| Serving boundary | CLI launcher server root and its bounded asset route |

Workspace Launch shares the Narada UI design system with Operator Console, but it is not a Site Registry page and does not acquire registry authority. The CLI remains the owner of launch policy and runtime handoff.

### Operator Console Launcher Router

`/console/launch` is a console-owned routing projection for CLI-owned persistent launcher sessions. The CLI session store owns the read-only persisted session projection; the page reaches it through its typed transport and composable. The inventory exposes stable `/console/launch/sessions/:ui_session_id` links, while the console server forwards only active loopback sessions and the launcher's known browser paths to the CLI-owned server. The console rewrites the launcher bootstrap and asset paths for that stable prefix; it does not start agents, submit launch selections, or duplicate launch authority. The CLI launcher remains the only authority for launch policy, runtime handoff, and session mutation.

### Agent Session Inventory

| Concern | Owner |
| --- | --- |
| Session descriptor and redacted wire record | `@narada2/operator-console-contract` |
| Durable session discovery | `@narada2/nars-session-core` session index |
| Site selection for discovery | CLI User Site Registry read model |
| Browser HTTP transport | `operator-console-ui/src/agent-sessions/transport.ts` |
| Browser contract adapter | `operator-console-ui/src/agent-sessions/adapter.ts` |
| Read and refresh state | `useAgentSessions` |
| Collection page | `/console/sessions` |
| Repeated projection | Session rows with lifecycle and liveness posture |

The session page is an inventory projection. It deliberately does not send
turns, control runtime lifecycle, expose local session paths, or replace Agent
Web UI. Session state is classified from the canonical NARS index and remains
truthful when liveness has not been probed.

## Shared Component Roles

- **Shell**: stable navigation, page framing, and cross-page context. It must not own domain data or mutations.
- **Page**: route-level composition and accessibility landmarks. It should be thin once a concept has a domain adapter and composable.
- **Collection projection**: repeated concept summary used for scanning and selection.
- **Detail projection**: selected concept state used for inspection without changing authority.
- **Workflow controls**: inputs and confirmation controls bound to a composable, with explicit pending, refusal, and success states.
- **Action**: a bounded command that calls the owning MCP/HTTP gateway. It is not a generic component callback that bypasses policy.

## Invariants

- Canonical contracts are the source of truth; UI types may rename wire fields but may not invent authority fields.
- Parsing happens in the typed adapter immediately after transport. Invalid envelopes become visible errors or a null adapter result, never partial domain state.
- Client requests cross a typed transport boundary before reaching a composable; a mounted surface supplies its base path explicitly rather than relying on the current URL by accident.
- Composables own asynchronous state and workflow transitions; templates do not duplicate fetch, plan, apply, or retry logic.
- Pages do not read databases, construct policy decisions, or call mutation endpoints directly.
- A route is explicit and typed. A generic page registry is not introduced until a second concept demonstrates the same route contract.
- The operator surface catalog is explicit and typed, but it does not imply that every descriptor has a page or that planned routes are reachable.
- Shared UI components remain presentation-only. Concept-specific labels, validation, and transitions stay in the concept module.
- A shared shell may host multiple concepts, but it must not imply that those concepts share lifecycle authority.

## Adding a New Concept

Before creating a page:

1. Identify the canonical contract and authority owner.
2. Define the browser adapter and malformed-response behavior.
3. Define the composable state machine and command boundary.
4. Decide whether the concept needs collection, detail, mutation, or a combination of separate pages.
5. Add only the projections and components that have a concrete repeated use.
6. Add route resolver coverage and composable/domain tests.
7. Update this map with the route, owner, and boundary.

Do not create a page merely because a backend endpoint exists. Create a page when an operator workflow has a distinct purpose, state, and completion boundary.
