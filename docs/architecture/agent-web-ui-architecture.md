# Agent Web UI Architecture And Ownership

## Status

This document is the implementation target for the Narada Agent Web UI package.
It describes the desired ownership boundaries and the migration direction for the
current Vue 3 and Vite implementation. It is not a description of every current
file.

`packages/agent-web-ui` is the production implementation of this target. The
launcher, CLI attach path, and Cloudflare projection assets resolve to this
package. There is one browser UX owner; the package is not a migration
predecessor or a parity oracle for another implementation.

The Web UI is a browser operator surface for one NARS session. It is a peer
projection of NARS, not a runtime host, provider adapter, MCP host, or session
authority.

Normal local browser ingress is governed by the
[Operator Router target](operator-router-target.md). Agent Web UI remains a
per-session backing projection and must support the router-assigned base path;
it does not own a stable host port.

## Objective

Keep the browser surface easy to extend without moving runtime authority into
Vue components or creating parallel interpretations of the NARS event stream.

The target architecture has one path for runtime data:

```text
NARS WebSocket and health HTTP
          |
          v
  Session transport adapter
          |
          v
      Session store
  events, cursor, health, identity
          |
          v
    Session projections
  normalized view models and activity
          |
          v
     Feature controllers
  conversation, operator, status, panels
          |
          v
       Vue components
```

User actions travel in the opposite direction:

```text
Vue interaction
      |
      v
Feature action or browser-local effect
      |
      v
Command controller
      |
      v
NARS protocol adapter
      |
      v
NARS session
```

## Boundary

### Owned by NARS

- session identity, lifecycle, health, and event ordering
- event retention authority and replay cursors
- provider turns and intelligence configuration
- MCP and Site tool execution
- command vocabulary and command admission
- operator message delivery semantics
- session mutations and recovery

### Owned by Agent Web UI

- browser connection and health presentation
- projection of NARS events into operator views
- conversation, operations, diagnostics, and raw view selection
- browser-local preferences and snippets
- keyboard, focus, scroll, and accessibility behavior
- rendering of canonical content parts
- browser-local command palette presentation
- panel layout and capability-driven panel discovery

### Explicitly not owned by Agent Web UI

- constructing runtime dependencies
- launching or supervising NARS
- hosting MCP servers
- executing provider turns
- deciding whether a command is admitted by NARS
- treating browser localStorage as session state
- maintaining a second event or command authority

## Architectural Invariants

1. There is one retained event store per browser attachment.
2. Event normalization, deduplication, and lifecycle projection happen once in
   the session projection layer.
3. Components receive typed view models and emit semantic actions. Components do
   not parse raw NARS envelopes or construct arbitrary protocol frames.
4. All NARS-bound actions pass through one command controller and one protocol
   adapter.
5. Chat, Operations, Diagnostics, and Raw are projections of the same session
   state, not separate event stores.
6. Activity indicators are derived from session events and health. They are not
   independent fake messages.
7. Streaming events, when present, are input evidence for the projection. The
   browser does not present them as a second conversation authority or pretend
   that every partial update is a separate assistant message.
8. Capability-specific panels appear only when the attached session advertises
   the relevant capability or surface.
9. Cloudflare and local NARS attachment implement the same browser session
   transport contract.
10. Browser preferences use fully qualified `narada:agent-web-ui:*` keys. They
    never contain runtime authority or durable session truth.
11. Compatibility code may preserve old entry points, but it delegates to the
    same projection and content semantics as the Vue surface.

## Target Package Shape

The exact filenames may change, but the ownership seams should remain visible:

```text
src/
  domain/
    session.ts
    events.ts
    identity.ts
    content-parts.ts
    commands.ts
    capabilities.ts

  transport/
    nars-session-transport.ts
    nars-frames.ts
    health-client.ts
    cloudflare-session-transport.ts

  session/
    session-store.ts
    session-controller.ts
    session-selectors.ts
    session-projection.ts
    activity-projection.ts

  features/
    conversation/
    operator/
    status/
    panels/
      mcp/
      sop/
      site/
      runtime/
      artifacts/
      delegation/

  content/
    MessageContent.vue
    markdown-renderer.ts
    code-renderer.ts
    artifact-renderer.ts
    intent-renderer.ts

  shell/
    AgentWebUiShell.vue
    Header.vue
    StatusRow.vue
    TranscriptRegion.vue
    ComposerRegion.vue
    PanelHost.vue

  compat/
    legacy-dom-renderer.ts

  host/
    local-web-server.ts
    cli-bootstrap.ts
```

The current `src/app` directory can remain during migration. The important
change is that its components consume the seams above instead of recreating
them locally.

## Reference Layout

`packages/agent-web-ui` is the proving ground for this architecture. Its
directory layout is intentional and should be extended by ownership rather than
by putting the next concern into the nearest existing component:

```text
packages/agent-web-ui/src/
  domain/       # framework-neutral event, session, content, command, capability types
  transport/    # local and Cloudflare attachment adapters; no Vue imports
  session/      # retained store, normalized projections, session controller, context
  content/      # rendering one canonical content-part model into Vue components
  features/
    conversation/ # transcript rows, activity, scroll authority
    operator/     # composer, queue, snippets, browser-local command interaction
    status/       # session status presentation only
    panels/       # capability-gated MCP/Site summary panels and their projections
  shell/        # composition of regions; provides feature controllers, not semantics
  host/         # static asset host and narrowly-scoped browser attachment proxy
```

The dependency direction is downward in this list: `shell` and `features` may
consume session projections; `session` may consume `domain` and `transport`;
`transport` may consume contract types. A lower layer must not import a Vue
feature or shell component. Cross-feature imports are permitted only through a
named controller or a domain type, never by reaching into a sibling component's
state.

### Extension Rules

- A new NARS summary starts with a contract frame, a pure event projection, and
  a capability predicate. Its panel is then registered declaratively through
  `features/panels/panel-registry.ts`.
- A new operator behavior starts in the operator controller. The composer only
  renders it and emits its semantic action.
- A new view of existing events is a projection from `session/projections.ts`,
  not another subscription or retained array.
- A new visual region belongs in `features/` when it owns one operator concern;
  it belongs in `shell/` only when it composes already-owned regions.
- A local and a Cloudflare attachment may differ at the transport edge, but
  expose the same `SessionTransport` behavior to the session controller.
- A feature is not complete merely because its panel renders. It needs a
  projection-level test and an E2E test through the real browser, local host,
  WebSocket, and NARS test fixture boundary.

The package tests and host/CLI acceptance checks record which production
behavior has reached this reference layout. They do not define the layering
rules above.

## Layer Responsibilities

### Domain and contract layer

This layer contains framework-neutral types and pure functions for session
events, identity, content parts, capabilities, commands, and actions. Shared
cross-client semantics belong in
[`nars-client-projection-contract.md`](../concepts/nars-client-projection-contract.md),
not in Vue components.

Canonical content parts are:

- `text`
- `markdown`
- `code`
- `artifact_ref`
- `intent_ref`

An `intent_ref` is structured operator affordance data. It is not hidden
instruction text and it does not directly execute an action.

### Transport layer

The transport layer converts a concrete attachment into a common session
source. It owns:

- WebSocket connection and reconnect behavior
- `session.events.subscribe`
- health HTTP polling or equivalent remote health access
- browser token and endpoint handling
- wire framing and protocol allowlists

The local transport and Cloudflare transport must expose the same operations to
the session controller. Cloudflare-specific URL or authority logic must not
spread through feature components.

### Session store

The session store is the only owner of retained runtime data in the browser.
It contains:

- ordered events keyed by runtime sequence and stable event identity
- replay cursor and connection state
- latest health snapshot
- session identity and authority metadata
- active turn and lifecycle state
- bounded retention policy

The store is not a second NARS authority. It is a browser cache of the attached
session stream and must be replaceable by replaying the same event source.

### Projection layer

Pure projection functions derive stable view models from the store:

- session identity
- activity state
- conversation rows
- operations rows
- diagnostics rows
- raw event rows
- MCP, SOP, Site, runtime, artifact, delegation, mailbox, and task summaries

Projection functions are idempotent. Replaying an event or receiving a duplicate
transport delivery must not create a second visible conversation message.

View mode and verbosity are projection parameters, not separate stores. Changing
them must recompute the visible rows from the same retained state and must not
mutate the event log.

### Feature controllers

Feature controllers coordinate one operator concern and expose typed state and
semantic actions. Examples:

- conversation controller: rows, view mode, scroll authority
- operator controller: draft, submit, steer, queue, interrupt, history
- status controller: identity, health, intelligence, authority, preferences
- panel controller: capability registry, open panel, panel-local state

Controllers may call the session controller. They must not reach into another
feature's private state or send raw protocol frames directly.

### Vue components

Components render view models and emit actions. A component may own local visual
state such as an open accordion or focused tab. It must not own:

- event deduplication
- protocol method names
- NARS command admission
- provider or MCP semantics
- session identity normalization

The top-level shell should compose regions and provide context. It should not
have a growing list of every summary, command, and callback in the application.
Feature context should be provided through a typed session/controller context or
feature-specific composables.

## Panel Architecture

Panels are capability projections, not hard-coded assumptions about every Site.

A panel descriptor should contain:

```ts
interface PanelDescriptor {
  id: string;
  label: string;
  capability: string;
  available: (session: SessionSnapshot) => boolean;
  component: Component;
  storageKey: string;
}
```

The panel host resolves descriptors against the current session capability
snapshot. MCP-specific panels may use MCP-advertised UI metadata, while the
generic MCP panel remains the fallback. A missing optional surface produces an
explicit unavailable state, not a fabricated empty capability.

Panel data is derived from the session projection. A panel may request a fresh
NARS summary through the feature controller, but it must not inspect raw event
arrays independently.

## Commands And Operator Input

The browser command palette is a UI for commands; it is not the command
authority. The command registry and action semantics follow
[`agent-web-ui-command-ux.md`](agent-web-ui-command-ux.md) and the shared NARS
projection contract.

The input path is:

```text
operator text
  -> local input parser
  -> browser-local action or typed NARS action
  -> command controller
  -> protocol adapter
  -> NARS
```

Ordinary text, steering, queueing, interrupt, slash commands, and intent
affordances must all be distinguishable in the resulting action model. The
composer should not contain a large switch over protocol method names.

## Content Rendering

Canonical content rendering belongs in typed content renderers. Markdown,
tables, code, Mermaid, artifact references, and intent references should share
one content-part model between the Vue renderer and the compatibility renderer.

The compatibility renderer currently lives in `src/render.js`. During
migration it should move under `src/compat/legacy-dom/` and depend on the shared
content and projection layers. It must not continue to implement an independent
deduplication, markdown, or activity model.

## Hosting

The local Web UI host has one narrow responsibility:

- serve the built browser assets
- inject attachment configuration
- proxy health when required by the browser security boundary
- print or open the browser URL

It does not create NARS runtime dependencies or execute provider work. The CLI
bootstrap should remain a thin adapter around the host. Hosted Cloudflare
projection uses the same built browser client and a remote transport adapter.

## Current File Migration Map

| Current area | Target responsibility |
| --- | --- |
| `src/app/App.vue` | Create/provide one session controller; remove feature wiring hub behavior |
| `NarsSessionShell.vue` | Layout regions and context consumption; remove large prop/event plumbing |
| `src/render.js` | Compatibility adapter over shared projection/content code |
| `src/server.js` | `host/local-web-server` adapter |
| `SessionStatusBar.vue` | Status region plus smaller status feature components |
| `useRuntimeTopology.ts` | Runtime capability selector/feature projection |
| `src/protocol/*` | Transport and wire-frame adapter |
| `src/app/composables/*` | Feature controllers and selectors, grouped by feature |
| `src/styles/*` | Keep explicit cascade layers; split only when ownership, not line count, demands it |
| `test/agent-web-ui.test.mjs` | Contract, integration, and feature test modules |
| `test/e2e/*` | Browser workflows grouped by feature and attachment mode |

The migration should preserve behavior at each seam. A file split is not
complete if it merely moves code while leaving two owners for the same state or
semantics.

## Test Topology

Tests should follow the same layers:

- domain tests for pure normalization, commands, content, and identity
- transport tests for wire framing, reconnect, health, and Cloudflare adapters
- session tests for retention, replay, deduplication, and lifecycle state
- feature tests for operator, status, panels, and view projections
- browser E2E for real browser, Web UI host, WebSocket, health, and NARS server
  mode behavior
- live smoke only for proving the attachment against a real local runtime
- compatibility tests for the legacy DOM entry points until they are removed

The default package test must remain bounded and non-browser. Browser E2E and
live smoke must stay explicit. No test should pass merely because it asserted
that a component or string exists while bypassing the transport and projection
boundary it claims to verify.

## Related Documents

- [`nars-client-projection-contract.md`](../concepts/nars-client-projection-contract.md)
- [`nars-runtime-contract.md`](../concepts/nars-runtime-contract.md)
- [`nars-session-management.md`](../concepts/nars-session-management.md)
- [`agent-web-ui-command-ux.md`](agent-web-ui-command-ux.md)
- [`cloudflare-nars-web-projection.md`](../concepts/cloudflare-nars-web-projection.md)
