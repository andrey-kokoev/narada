# MCP-Specific Operator Panels

This document defines the boundary for operator panels that display MCP-backed
or operational data in `@narada2/agent-web-ui`.

## Current Contract

The default local NARS runtime exposes the narrow session-core controls:

- `session.submit`
- `session.health`
- `session.recovery`
- `session.cancel`
- `session.close`
- `session.events.subscribe` and `session.events.read` on the event-stream transport

It does not expose panel-summary, surface-affordance, observer, authority,
or `session.command.execute` methods. A local browser must not send those
methods to the runtime.

The browser still owns read-only panel projections. `SessionController` derives
panel state from retained session events and health data. The panel modules are
projections, not MCP clients and not runtime authorities.

## Transport Split

`@narada2/agent-web-ui` has two transport paths:

| Path | Admitted controls | Panel-summary behavior |
| --- | --- | --- |
| Local session-core WebSocket | Narrow session-core list and event replay controls | Unsupported summary/affordance frames are refused before WebSocket send. Event-derived panels remain available. |
| Cloudflare projection | Narrow controls plus the explicitly named Cloudflare adapter vocabulary | Narrow input is translated at the adapter boundary to the Cloudflare projection's legacy verbs. Cloudflare-only panel methods remain remote adapter methods. |

The distinction is executable in
`packages/nars-client-projection-contract/src/nars-client-projection-contract.mjs`:

- `NARS_SESSION_CORE_METHOD_LIST` is the local contract.
- `AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST` is the remote adapter inventory.
- `isNarsSessionCoreProtocolFrame()` validates local frames.
- `isAgentWebUiCloudflareProtocolFrame()` validates the remote adapter path.

The deprecated `packages/agent-web-ui` predecessor uses the explicitly named
Cloudflare adapter validator and translator for compatibility. That package is
not a local runtime owner.

## Panel Data Rules

1. Panel state is derived from durable session events, health, and explicit
   event replay. It is not fetched by calling MCP from browser code.
2. A panel may display an action candidate, but a candidate is not authority
   to execute the action.
3. A panel action is executable only when an owning runtime or remote adapter
   advertises an admitted method and supplies an implementation for it.
4. Unsupported local panel refreshes return `false` and do not write to the
   local WebSocket. The UI must preserve the existing event projection.
5. Health, event, and artifact routes remain projection routes. They are not
   implicit MCP calls.

## Deferred Affordance Boundary

The following vocabulary remains defined for the Cloudflare adapter and older
projection fixtures, but is not a current local implementation:

- `session.surface.affordances`
- `session.affordance.action.request`
- `session.affordance.action.confirm`
- `session.affordance.action.cancel`
- `session.sop.summary`
- `session.artifacts.summary`
- the other domain-specific summary methods

Before any of these become local session-core controls, implementation must
add all of the following in one change:

1. An owning runtime handler with explicit input and output schemas.
2. Durable evidence and replay behavior where the action has an effect.
3. Admission and authority checks outside browser code.
4. A local transport allowlist entry.
5. Unit, integration, and browser tests proving refusal and success paths.
6. Updates to the session-core contract and this document.

Until then, the correct local behavior is refusal, not a synthetic success or
an MCP call from the browser.

## Security Invariants

- Browser code never invokes an MCP tool directly.
- A displayed affordance never grants authority.
- Cloudflare adapter translation does not widen local session-core authority.
- Unsupported methods fail before crossing the local transport boundary.
- Remote panel methods remain scoped to the Cloudflare adapter and cannot be
  inferred from a method name alone; their behavior is declared by the adapter
  registry and implementation.

## Verification

Keep these surfaces aligned when changing panel or transport behavior:

- `packages/nars-client-projection-contract/src/nars-client-projection-contract.mjs`
- `packages/agent-web-ui/src/server.js`
- `packages/agent-web-ui/src/agent-web-ui.js`
- `packages/agent-web-ui/src/session-projection.js`
- `packages/agent-web-ui/src/app/components/`
- `packages/agent-web-ui/test/`

The focused proof must cover local narrow-frame admission, local refusal of
adapter-only methods, Cloudflare translation of `session.submit`, event-derived
panel rendering, and the no-direct-MCP invariant.
