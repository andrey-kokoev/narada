# Shared Narada UI Package Boundary

## Decision

Narada web presentation is split into a cross-renderer CSS foundation and a Vue component layer. Product-specific session behavior remains in Agent Web UI.

The packages live in the Narada repository at D:/code/narada. They are not MCP surface packages.

## @narada2/ui

@narada2/ui owns renderer-neutral web presentation foundations:

- design tokens and semantic CSS variables
- typography, reset, base layout, and accessibility defaults
- reusable CSS control and surface primitives
- the compiled styles.css consumer entrypoint
- the build and Tailwind source-scanning contract needed to produce that entrypoint

The package must be consumable by standalone server-rendered HTML without Vue, Agent Web UI session state, or a second copied foundation stylesheet.

## @narada2/ui-vue

@narada2/ui-vue owns Vue-specific reusable primitives:

- Narada-owned source for selected shadcn-vue primitives
- Vue wrappers and runtime adapters
- cn() and component utility exports
- the explicit primitive export manifest
- generator configuration needed to maintain the source components

shadcn-vue is a development generator, not a runtime dependency of consumers. The package must not expose Agent Web UI session panels, MCP domain components, composables, or protocol behavior.

## @narada2/agent-web-ui

Agent Web UI owns session-specific presentation and behavior:

- NARS session transport and projection
- session shell and navigation
- MCP panels and operator panels
- event, transcript, composer, and runtime-specific views
- application composables and session state
- product-specific styles that are not part of the shared foundation

It consumes @narada2/ui and @narada2/ui-vue; it is not their implementation owner.

## MCP surfaces

D:/code/mcp-surfaces remains UI-neutral. MCP packages may define UI-neutral affordance documents and validation contracts, but they must not import @narada2/ui, @narada2/ui-vue, Vue components, Tailwind runtime code, or Agent Web UI modules.

The forbidden-renderer-import guard belongs in the repository that owns the MCP surface boundary.

## Dependency Direction

Allowed direction:

- @narada2/ui has no dependency on Agent Web UI or MCP domain code.
- @narada2/ui-vue depends on @narada2/ui and Vue UI runtime dependencies.
- @narada2/agent-web-ui depends on both shared UI packages.
- CLI Site Registry may consume @narada2/ui styles but does not acquire a Vue runtime requirement.
- mcp-surfaces remains independent of all renderer packages.

## Consumer Matrix

| Consumer | CSS foundation | Vue primitives | Session components |
| --- | --- | --- | --- |
| Standalone HTML or CLI page | @narada2/ui | No | No |
| Vue web surface | @narada2/ui | @narada2/ui-vue | App-owned |
| Agent Web UI | @narada2/ui | @narada2/ui-vue | @narada2/agent-web-ui |
| MCP surface | No renderer package | No | No |

## Non-Goals

This boundary does not redesign the existing visual system, move session-specific components into a generic package, or make MCP surfaces renderer-aware.
