# Shared Narada UI Consumer Contract

## Purpose

This is the durable consumer contract for Narada's shared web presentation
packages. It defines which package owns a concern, which package a consumer may
depend on, and which checks prove that the boundary remains intact.

The package boundary is in D:/code/narada. It is separate from the
UI-neutral MCP surface boundary in D:/code/mcp-surfaces.

## Package Selection

| Consumer need | Consume | Do not consume |
| --- | --- | --- |
| Standalone HTML or a server-rendered CLI page | `@narada2/ui` via the compiled `styles.css` export | `@narada2/ui-vue`, Vue runtime, Agent Web UI |
| Reusable Vue primitive | `@narada2/ui` and `@narada2/ui-vue` | Agent Web UI session components |
| Agent Web UI session experience | `@narada2/ui`, `@narada2/ui-vue`, and app-owned session code | Copying shared foundation styles or taking ownership of shared primitives |
| MCP surface | No renderer package | `@narada2/ui`, `@narada2/ui-vue`, Vue/React/Svelte, Tailwind runtime, Agent Web UI |

## @narada2/ui

`@narada2/ui` owns the renderer-neutral CSS foundation:

- semantic design tokens and light/dark theme values;
- typography, reset, control defaults, and base accessibility rules;
- reusable CSS primitives such as truncation and list reset;
- the compiled `./styles.css` consumer export;
- the build and source-scanning configuration needed to produce the export.

The public runtime contract is the built stylesheet. A consumer must build the
package before serving or embedding it. A standalone page must not import the
package's source CSS through a development-only alias.

The CLI Site Registry uses the package export at render time, reads the declared
build artifact, and embeds it into a bounded `<style>` element. This
keeps the page usable without a dev server or Vue bundle. Its remaining inline
CSS is Registry-specific layout, form, lifecycle, preview, and responsive
behavior and must use shared semantic tokens.

## @narada2/ui-vue

`@narada2/ui-vue` owns Narada's reusable Vue primitive layer:

- source-owned wrappers for the explicit initial shadcn-vue primitive set;
- Vue runtime adapters and `cn()`;
- workspace component and component-style exports;
- `components.json` generator metadata.

The package may depend on `@narada2/ui` and Vue UI runtime dependencies.
It is private and workspace-only; its source exports are intentionally compiled
by Narada-owned Vue applications. It is not part of the external npm consumer
contract.
It must not absorb Agent Web UI session state, MCP domain components,
application composables, or product-specific panels. shadcn-vue is a generator
and maintenance input; it is not the consumer boundary for application code.

## @narada2/agent-web-ui

Agent Web UI owns session-specific behavior:

- NARS transport and event projection;
- the session shell, navigation, operator panels, and MCP panels;
- transcript, event, composer, and runtime-specific views;
- app composables, protocol adapters, and session state;
- styles that target those product surfaces.

Its stylesheet entrypoint imports `@narada2/ui/styles.css` and
`@narada2/ui-vue/components.css` first, then app-owned layers. It may
keep product rules that happen to use shared tokens. It must not recreate shared
token, reset, primitive, or generic command/tooltip implementation files.

## MCP Surface Boundary

D:/code/mcp-surfaces remains UI-neutral. It may expose UI-neutral affordance
documents and validation helpers, but MCP packages must not import Narada
renderer packages, UI runtime packages, stylesheet modules, or Agent Web UI.

The forbidden-renderer-import guard is owned and run in D:/code/mcp-surfaces.
The Narada tests below verify Narada package consumers; they do not claim to
enforce a rule in a different repository.

## Extracted Foundation Inventory

The extraction is complete only when each foundation rule has one owner.

### Shared owners

- Tokens, reset, base typography, controls, and generic CSS primitives:
  `packages/ui/src/styles.css`.
- Shared Vue command and tooltip source:
  `packages/ui-vue/src/components` and
  `packages/ui-vue/src/components.css`.
- Vue utility and public exports:
  `packages/ui-vue/src/lib/utils.ts` and
  `packages/ui-vue/src/index.ts`.

### Removed duplicates

- Agent Web UI copied command and tooltip component directories were removed.
- Agent Web UI's copied `src/app/lib/utils.ts` was removed.
- Agent Web UI's copied `theme.css`, `primitives.css`, and
  `dark-theme.css` foundation files were removed.
- Site Registry's copied foundation rules were replaced by the compiled
  `@narada2/ui/styles.css` artifact.

### Explicit app-specific exceptions

These files are intentionally not shared foundation duplicates:

- Agent Web UI `src/styles/base.css` owns only full-height shell sizing.
- `src/styles/operator-surfaces.css`, `shell-and-navigation.css`,
  `panels.css`, `layout-and-status.css`,
  `events-and-content.css`, `composer.css`, and
  `responsive.css` own product-specific session presentation.
- `src/styles/dark-overrides.css` maps product selectors to shared
  dark-theme tokens and is not a second token system.
- Product command-palette `.command-*` layout rules remain in the
  Agent Web UI composer because they describe that application's interaction.
- Site Registry inline rules remain in its renderer because they describe its
  standalone tables, mutation workflow, previews, and responsive layout.

Any future CSS file must be classified as shared foundation, Vue primitive,
product-specific exception, or removed duplicate before it is added.

## Verification Contract

The following checks are the durable evidence for this boundary:

1. `pnpm --filter @narada2/ui test` proves the compiled CSS export and
   plain HTML fixture.
2. `pnpm --filter @narada2/ui-vue test` proves Vue typechecking, the
   public primitive imports, and the built fixture.
3. `pnpm --filter @narada2/agent-web-ui typecheck`,
   `pnpm --filter @narada2/agent-web-ui build`,
   `pnpm --filter @narada2/agent-web-ui test`, and
   `pnpm --filter @narada2/agent-web-ui test:browser` prove the
   migrated session consumer.
4. `pnpm --filter @narada2/ui build` followed by
   `pnpm --filter @narada2/cli typecheck` and the focused
   `console-server.test.ts` run prove the standalone CLI delivery
   path from a built checkout.
5. `node --import tsx --test test/integration/operator-console-ui-e2e.test.mjs`
   from `packages/layers/cli` proves the modern Operator Console Registry workflow at
   1280x900 and 390x844, including overflow, hidden fields, refresh-preserved
   drafts, discard restoration, lifecycle blocking, and confirmation-gated
   apply.
6. `pnpm test:ui-boundary` in D:/code/mcp-surfaces proves the
   repository-owned renderer-import boundary. It is intentionally a separate
   check from the Narada-side package tests.

When a check fails, classify the failure as a package ownership error, an
export/build delivery error, an unclassified duplicate, or a consumer-specific
regression before changing the boundary.
