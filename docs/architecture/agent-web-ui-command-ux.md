# Agent Web UI Command UX

## Objective

Make Agent Web UI commands first-class static objects so the slash palette, parser, help text, tests, and protocol actions derive from the same registry.

This document describes the static target. Dynamic command discovery from NARS is out of scope for the first implementation pass.

## Current Shape

The Web UI can submit operator text and some slash-like inputs, but command behavior is not first-class. Parsing currently lives as hard-coded branches in the client projection contract, while the Vue input surface only discovers command meaning at submit time.

That is enough for protocol routing, but not enough for a good operator UX:

- `/` as the first character cannot open a searchable command palette.
- `/help` cannot be generated from the same command inventory that execution uses.
- Unknown slash commands can be confused with ordinary conversation input.
- UI affordances, tests, and protocol frames can drift because they do not share one command definition.

## Target Invariants

- Commands have one static source of truth: `AGENT_WEB_UI_COMMANDS`.
- The parser and command palette both consume that registry.
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
  group: 'conversation' | 'session' | 'diagnostics' | 'settings' | 'local' | 'advanced';
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

## Initial Static Inventory

The first static inventory should include the commands already implied by Agent CLI and Web UI behavior:

- `/help`
- `/status`
- `/health`
- `/recovery`
- `/ops`
- `/observers`
- `/observer mute`
- `/observer unmute`
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

Owns command definitions, parsing, action construction, validation, help generation, and unit tests for protocol behavior.

`packages/agent-web-ui`

Owns palette rendering, keyboard interaction, local UI command effects, and browser-level accessibility tests.

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

