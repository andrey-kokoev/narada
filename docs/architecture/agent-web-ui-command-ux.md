# Agent Web UI Command UX

## Objective

Make Agent Web UI commands first-class static objects so the slash palette, parser, help text, tests, and protocol actions derive from the same registry.

This document describes the static target. Dynamic command discovery from NARS is out of scope for the first implementation pass.

This is the browser-specific UX target. The shared slash-command documentation authority is [`../concepts/nars-client-projection-contract.md`](../concepts/nars-client-projection-contract.md#operator-slash-command-projection), which defines command strata, source tables, direct NARS protocol commands, session command pass-through, and drift rules across `agent-cli`, `agent-web-ui`, terminal projection, and future clients.

## Current Shape

The Web UI can submit operator text and some slash-like inputs, but command behavior is not first-class. Parsing currently lives as hard-coded branches in the client projection contract, while the Vue input surface only discovers command meaning at submit time.

That is enough for protocol routing, but not enough for a good operator UX:

- `/` as the first character cannot open a searchable command palette.
- `/help` cannot be generated from the same command inventory that execution uses.
- Unknown slash commands can be confused with ordinary conversation input.
- UI affordances, tests, and protocol frames can drift because they do not share one command definition.

## Target Invariants

- Commands have one static source of truth: `AGENT_WEB_UI_COMMANDS`.
- The parser and command palette both consume that registry; snippet subcommand grammar lives beside it in `AGENT_WEB_UI_SNIPPET_ACTIONS`.
- Vue components render and select commands; they do not own command semantics.
- Unknown slash commands are handled explicitly and never silently become normal conversation.
- Static command shape is versioned with the package and does not require a live NARS session to render the palette.
- Dynamic command discovery can be added later as an extension layer, not as the base contract.

## Command Kinds

`local_ui`

Commands executed entirely by the browser projection. Examples: show help, clear local view state, open a panel, switch view.

`nars_protocol`

Commands that map to known NARS protocol actions. Examples: status, health, recovery, interrupt, close session.

`nars_session_command`

Commands that pass through to the NARS session command endpoint, for compatibility with terminal-style commands. Examples: tools, queue, model, thinking, stats, tool-output.

`raw_protocol_frame`

Advanced escape hatch for sending an explicit protocol frame. This should be hidden or de-emphasized in the default palette and validated before submit.

## Registry Contract

The registry should be a data structure, not a parser switch statement. A representative TypeScript shape:

```ts
export type AgentWebUiCommandKind =
  | 'local_ui'
  | 'nars_protocol'
  | 'nars_session_command'
  | 'raw_protocol_frame';

export interface AgentWebUiCommand {
  id: string;
  slash: `/${string}`;
  aliases?: `/${string}`[];
  kind: AgentWebUiCommandKind;
  group: 'conversation' | 'session' | 'diagnostics' | 'settings' | 'snippets' | 'local' | 'advanced';
  title: string;
  description: string;
  keywords?: string[];
  args?: AgentWebUiCommandArg[];
  palette: {
    visible: boolean;
    rank: number;
    danger?: boolean;
  };
  buildAction(input: AgentWebUiCommandInput, context: AgentWebUiCommandContext): AgentWebUiOperatorAction;
}
```

The exact exported names can change during implementation, but the ownership boundary should not: command semantics live in the projection contract package and UI components consume derived view models.

## Parser Behavior

The parser should follow this order:

1. If input does not begin with `/`, submit it as normal operator conversation text.
2. If input begins with `/`, resolve the command by `slash` or `aliases`.
3. If no command matches, return a local validation action with a readable unknown-command message.
4. If required arguments are missing, return a local validation action with usage text.
5. If valid, call the command object's `buildAction` and submit the resulting action.

This keeps slash input deterministic. A leading slash means command mode, not conversation mode.

## Palette UX

The palette opens when the operator input starts with `/`.

Search should match slash name, alias, title, description, group, and keywords. Results should be sorted by registry rank and then by match strength.

Keyboard behavior:

- `ArrowDown` and `ArrowUp` move selection.
- `Enter` executes the selected command when it is complete.
- `Tab` accepts autocomplete for the selected command or moves to the next argument slot.
- `Escape` closes the palette first. If the palette is not open, the existing interrupt/steer behavior owns `Escape`.
- `Shift+Enter` keeps its current multiline input meaning.

Mouse behavior:

- Clicking a command selects it.
- Commands with required arguments fill the input with `/<command> ` and keep focus in the composer.
- Complete commands may execute directly only when that is less surprising than filling the input. The conservative default is fill first, submit second.

Accessibility behavior:

- The input/palette pair should use combobox/listbox semantics.
- The active option should be exposed with `aria-activedescendant` or an equivalent pattern.
- Palette opening and validation errors should not steal focus from the operator input.

## Help UX

`/help` should be generated from `AGENT_WEB_UI_COMMANDS`.

Help output should group commands by operator intent, not by implementation kind. A useful order is:

1. Conversation control
2. Session state
3. Diagnostics
4. Settings
5. Local UI
6. Advanced

Hidden or advanced commands should appear only when the operator asks for advanced help, or when the UI is in an advanced mode.

## Operator Snippet Scope

`/snippet` entries are operator-local saved text commands. The current persistence key is intentionally scoped to the Agent Web UI browser/operator surface, not to a Narada Site, NARS session, or workspace:

```text
narada:agent-web-ui:operator-snippets.v1
```

This means snippets follow the browser profile and origin used by the operator. They can be reused across Sites that are operated through the same Agent Web UI origin. That behavior is deliberate for the current implementation: snippets are personal operator conveniences, not Site authority, shared team configuration, or session state.

If snippets later become Site-owned or team-shared assets, that should be a new storage contract rather than an implicit change to this browser-local key.

## Operator Snippet UX

Snippets are first-class Agent Web UI operator affordances, with slash commands as the fast path.

The palette should surface snippets when the operator searches by snippet name or body, not only when the query starts with `/snippet`. Selecting a snippet from the top-level palette runs or queues the stored body directly as conversation input; it must not reparse a slash-prefixed snippet body as a slash command.

The `/snippet` command opens a snippet-specific second-level selector rather than a flat command list. The first level offers snippet actions such as search, run, enqueue, save, edit, and delete. Selecting `run` or `enqueue` moves into snippet selection filtered by the following text. Selecting or submitting `search` opens the snippets drawer filtered by the following text. `/snippets [query]` remains the direct drawer/search shortcut.

The Snippets drawer is the management surface for browser/operator-local snippets. It should support:

- searching saved snippets by name or body
- creating a snippet without composing `/snippet save ...` by hand
- editing or renaming the full snippet body
- inspecting the full saved body before use
- running or queuing a saved snippet
- filling the composer with a snippet body for manual edits before send
- copying a snippet body
- pinning snippets and sorting pinned/recently used snippets first
- tracking use count and last-used timestamps
- deleting a saved snippet with an immediate undo affordance
- exporting and importing browser-local snippets as JSON

The drawer should expose clear empty states for both no snippets and no search matches. It should show name-normalization feedback before save, character/line counts for multi-line bodies, and keyboard affordances such as `Ctrl+Enter` to save and `Esc` to close.

Slash commands remain available for efficient keyboard use. `/snippets [query]` opens the Snippets drawer directly, filtered by the optional query, even when the snippets header control is hidden by the operator's header preferences.

- `/snippets [query]`
- `/snippet search <query>`
- `/snippet save <name> <text>`
- `/snippet edit <name> <text>`
- `/snippet delete <name>`
- `/snippet run <name>`
- `/snippet enqueue <name>`

## Initial Static Inventory

The first static inventory should include the commands already implied by Agent CLI and Web UI behavior:

- `/help`
- `/status`
- `/health`
- `/events`
- `/recovery`
- `/ops`
- `/observers`
- `/observer mute`
- `/observer unmute`
- `/interrupt`
- `/clear`
- `/exit`
- `/json <frame>`
- `/tools`
- `/queue`
- `/goal`
- `/stats`
- `/model`
- `/thinking`
- `/tool-output`

Commands that are not yet implemented in projected server mode should still be explicit. They can resolve to a readable unavailable action instead of disappearing from the model.

## Package Ownership

`packages/nars-client-projection-contract`

Owns Agent Web UI command definitions, parsing, action construction, validation, help generation, and unit tests for browser/web protocol behavior. Shared cross-client slash-command doctrine lives in `docs/concepts/nars-client-projection-contract.md`; this architecture note is the web palette implementation target.

`packages/agent-web-ui`

Owns palette rendering, keyboard interaction, local UI command effects, panel rendering, and browser-level accessibility tests. Browser E2E for ordinary Agent Web UI UX uses Playwright-managed browsers through `pnpm --filter @narada2/agent-web-ui test:e2e`; `pnpm --filter @narada2/agent-web-ui test:browser` is an alias for that path. `OperatorComposer.vue` should stay a thin render/wiring surface; command palette state lives in `useOperatorCommandPalette`, snippet CRUD/search/storage lives in `useOperatorSnippets`, and Esc interrupt prompt state lives in `useOperatorInterruptPrompt`.

The browser test split is intentional:

- Playwright fixture-backed browser E2E owns ordinary browser UX: slash commands, snippet palette/drawer behavior, viewport/layout smoke, markdown rendering, confirmation panels, and MCP/SOP panel rendering against fixture NARS surfaces. This tier must keep the browser, Agent Web UI server, WebSocket event projection, HTTP health projection, NARS server-mode protocol, and runtime event assertions real. It may use deterministic fixture providers, fixture MCPs, synthetic temp Site roots, and synthetic credentials only behind those real protocol boundaries.
- Slash/snippet browser E2E should be registry-driven where possible. In particular, changes to `AGENT_WEB_UI_COMMANDS` or `AGENT_WEB_UI_SNIPPET_ACTIONS` should update or exercise the browser matrix rather than adding hand-picked duplicate cases.
- Live-runtime smoke owns narrow proof that the same projection works against a real local NARS runtime and browser outside the Playwright fixture harness; the focused slash path is `pnpm --filter @narada2/agent-web-ui test:live:slash-commands`. That smoke still uses fixture provider/MCP seams where declared. It does not replace comprehensive fixture-backed E2E, and fixture-backed E2E does not prove live provider quality or external API behavior.
- Raw CDP helpers are reserved for projection/protocol smoke where browser attachment, hosted Cloudflare projection, or artifact transport is the subject under test. They run only through the explicit `test:browser:cdp` path or live/projection-specific scripts.
- New Agent Web UI browser UX tests should be added under `packages/agent-web-ui/test/e2e/*.spec.js`; do not add new ordinary UI coverage to raw CDP node-test files.

`packages/carrier-runtime` and NARS packages

Own protocol endpoints and server-side command execution. They should not own browser palette metadata.

## Implementation Plan

1. Add static command registry to `@narada2/nars-client-projection-contract`.
2. Refactor existing operator input parsing to resolve through the registry.
3. Add generated help text from the registry.
4. Add focused parser tests for aliases, missing arguments, unknown commands, and unavailable commands.
5. Add `CommandPalette` and a small composition helper in Agent Web UI.
6. Wire the palette into the operator composer without changing ordinary text submit behavior.
7. Add UI tests for `/` opening, search filtering, keyboard selection, `Escape`, and submit behavior.

## Acceptance Criteria

- Typing `/` at the start of the operator input opens a searchable command palette.
- Selecting a command either fills the input or executes it according to the command contract.
- `/help` output is generated from the same registry used by the parser.
- Unknown slash commands produce a clear local validation message.
- `Escape` closes the palette before it triggers any interrupt or steer flow.
- Existing commands keep producing the same protocol actions they produced before the registry refactor.
- The feature works without a live NARS session because the initial command inventory is static.
