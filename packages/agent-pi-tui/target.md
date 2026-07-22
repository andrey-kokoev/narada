````md

\# Task: Implement `agent-pi-tui` as a NARS operator-surface projection



\## Objective



Add a fourth NARS-backed operator surface:



```text

NARS

&#x20; ├── agent-cli

&#x20; ├── agent-tui

&#x20; ├── agent-web-ui

&#x20; └── agent-pi-tui

````



`agent-pi-tui` must provide a Pi-style terminal experience while remaining a pure client and projection of an existing Narada Agent Runtime Server session.



It must use:



\* `@earendil-works/pi-tui` as the terminal rendering substrate;

\* extracted or adapted Pi interactive presentation components;

\* Narada-owned NARS attachment, event projection, input framing, reconnect, and recovery semantics.



It must not embed or launch the Pi agent runtime.



\## Canonical definition



> `agent-pi-tui` is a NARS projection client using Pi’s TUI substrate and presentation grammar, without Pi session, provider, tool, queue, persistence, extension-runtime, or operational authority.



\## Target architecture



```text

@narada2/agent-runtime-server

&#x20;             │

&#x20;             │ NARS protocol, event replay, live events,

&#x20;             │ health, recovery, artifacts, admission

&#x20;             ▼

@narada2/agent-pi-tui

&#x20; ├── NARS client adapter

&#x20; ├── shared client projection contract

&#x20; ├── Pi-style presentation view models

&#x20; ├── extracted Pi presentation components

&#x20; └── @earendil-works/pi-tui

```



The application flow must be:



```text

terminal input

&#x20; -> shared operator-input classification

&#x20; -> local projection action or NARS protocol frame

&#x20; -> NARS admission

&#x20; -> durable NARS event

&#x20; -> shared NARS client projection

&#x20; -> Pi-style view model

&#x20; -> pi-tui component rendering

```



\## Required invariant



```text

agent-pi-tui is a view of NARS

not a second agent runtime

```



Closing, reconnecting, or opening another `agent-pi-tui` instance must not create, replace, fork, or terminate the underlying NARS session unless an explicit admitted session control is sent.



\---



\# Package



Create a package such as:



```text

packages/agent-pi-tui/

```



Package identity:



```json

{

&#x20; "name": "@narada2/agent-pi-tui",

&#x20; "version": "0.1.0",

&#x20; "type": "module",

&#x20; "private": true,

&#x20; "narada": {

&#x20;   "package\_role": "nars\_client\_projection",

&#x20;   "operator\_surface\_kind": "agent-pi-tui",

&#x20;   "runtime\_server\_owner": "@narada2/agent-runtime-server",

&#x20;   "rendering\_substrate": "@earendil-works/pi-tui"

&#x20; }

}

```



Binary:



```text

narada-agent-pi-tui

```



Expected invocation:



```powershell

narada-agent-pi-tui --attach ws://127.0.0.1:<port>/events

```



It may also accept a session handle or discovery reference resolved through the existing NARS client attachment contract.



\---



\# Source boundaries



\## Use from `@earendil-works/pi-tui`



Consume the public package rather than copying its generic infrastructure.



Expected primitives include:



```text

TUI

ProcessTerminal

Terminal

Container

Component

Focusable

Editor

EditorComponent

Markdown

Text

TruncatedText

Image

SelectList

SettingsList

Loader

CancellableLoader

autocomplete

keybindings

keyboard decoding

overlays

terminal capabilities

terminal image support

width/wrapping utilities

```



Treat this package as the rendering toolkit.



\## Extract or adapt from Pi interactive presentation



Evaluate and selectively adapt presentation-only behavior corresponding to:



```text

CustomEditor

AssistantMessageComponent

UserMessageComponent

ToolExecutionComponent

BashExecutionComponent, only as a generic operation-result renderer

FooterComponent

status indicators

keybinding hints

theme system

model/status selectors, only where backed by admitted NARS methods

session selector visual grammar, only where backed by NARS session discovery

tree or branch visual grammar, only if NARS gains an owning contract

```



Do not import Pi `InteractiveMode` wholesale.



Create Narada-owned equivalents with explicit upstream provenance where Pi implementation code is adapted.



Preserve applicable MIT license notices, copyright attribution, and source references.



\## Do not include from Pi



The following are outside the operator-surface boundary:



```text

AgentSession

AgentSessionRuntime

SessionManager

ModelRuntime

Pi RPC mode

Pi RpcClient

provider execution

provider credentials

Pi built-in read/write/edit/bash tools

ExtensionRunner

extension tool execution

Pi package manager

Pi trust authority

Pi session JSONL as canonical state

Pi queue state machines

Pi compaction or retry authority

Pi slash-command execution

Pi model selection authority

Pi shell/process execution

```



No dependency or transitive launch path may cause these to become active runtime ownership inside `agent-pi-tui`.



\---



\# Proposed internal layout



```text

packages/agent-pi-tui/

&#x20; bin/

&#x20;   narada-agent-pi-tui.mjs



&#x20; src/

&#x20;   main.ts

&#x20;   app.ts



&#x20;   nars-client/

&#x20;     attach-client.ts

&#x20;     transport.ts

&#x20;     protocol.ts

&#x20;     event-stream.ts

&#x20;     replay.ts

&#x20;     reconnect.ts

&#x20;     input-delivery.ts

&#x20;     artifact-client.ts

&#x20;     session-discovery.ts



&#x20;   projection/

&#x20;     projection-adapter.ts

&#x20;     pi-row-view-model.ts

&#x20;     transcript-model.ts

&#x20;     operation-model.ts

&#x20;     diagnostics-model.ts

&#x20;     status-model.ts

&#x20;     footer-model.ts

&#x20;     artifact-model.ts



&#x20;   input/

&#x20;     operator-input.ts

&#x20;     slash-command.ts

&#x20;     delivery-mode.ts

&#x20;     keybindings.ts

&#x20;     composer-history.ts



&#x20;   components/

&#x20;     assistant-message.ts

&#x20;     user-message.ts

&#x20;     tool-execution.ts

&#x20;     operation-row.ts

&#x20;     diagnostic-row.ts

&#x20;     artifact-row.ts

&#x20;     status-indicator.ts

&#x20;     footer.ts

&#x20;     composer.ts

&#x20;     transcript.ts

&#x20;     help-overlay.ts

&#x20;     selector-overlay.ts



&#x20;   theme/

&#x20;     theme.ts

&#x20;     pi-compatible-theme.ts



&#x20;   state/

&#x20;     client-state.ts

&#x20;     scroll-authority.ts

&#x20;     pending-input.ts

&#x20;     connection-state.ts



&#x20;   test/

&#x20;     fixtures/

&#x20;     projection.test.ts

&#x20;     input.test.ts

&#x20;     reconnect.test.ts

&#x20;     pty-e2e.test.ts

```



Names may vary, but the ownership split must remain explicit.



\---



\# NARS client contract



`agent-pi-tui` must consume the same protocol and projection semantics as the existing NARS clients.



Required controls:



```text

session.submit

session.health

session.recovery

session.cancel

session.close

session.events.subscribe

session.events.read

```



Where currently admitted:



```text

runtime.intelligence.reconfigure

```



Required behaviors:



\* attach to an existing NARS session;

\* bounded replay before live subscription;

\* replay/live overlap deduplication;

\* reconnection using durable event cursors;

\* explicit distinction between socket write and durable admission;

\* no automatic resend after ambiguous transport failure;

\* preservation of input idempotency keys;

\* active-turn steering or queued delivery through the canonical NARS delivery-mode contract;

\* health and recovery projection;

\* graceful session close;

\* artifact reference rendering;

\* connection-local errors clearly separated from durable session failures.



Do not create a Pi-specific server protocol.



\---



\# Shared projection semantics



`agent-pi-tui` must not classify NARS events independently.



Consume:



```text

@narada2/nars-client-projection-contract

```



or a generated representation-neutral artifact owned by that package.



Every client must agree on:



```text

projection class

row kind

label

tone

summary

identity

render key

view eligibility

canonical-conversation status

deduplication key

durable-acknowledgment meaning

input-delivery phase changes

```



Projection classes remain:



```text

conversation

operations

diagnostics

raw

```



The Pi-style presentation layer may change visual treatment but not event meaning.



Required mapping:



```text

NARS event

&#x20; -> shared projection record

&#x20; -> PiRowViewModel

&#x20; -> pi-tui component

```



Suggested representation:



```ts

export interface PiRowViewModel {

&#x20; renderKey: string

&#x20; projectionClass:

&#x20;   | "conversation"

&#x20;   | "operations"

&#x20;   | "diagnostics"

&#x20;   | "raw"



&#x20; kind: string

&#x20; identity?: {

&#x20;   id?: string

&#x20;   label?: string

&#x20;   role?: string

&#x20; }



&#x20; content: PiRenderableContent\[]

&#x20; tone?: string

&#x20; status?: string

&#x20; timestamp?: string



&#x20; expandable?: boolean

&#x20; expandedByDefault?: boolean

&#x20; pending?: boolean

&#x20; terminal?: boolean

}

```



The adapter must remain deterministic and fixture-tested.



\---



\# Presentation target



Reproduce the useful interaction qualities of Pi’s interactive terminal experience:



\* compact transcript;

\* strong editor/composer;

\* assistant streaming presentation;

\* expandable tool and operation output;

\* visible current model/provider/thinking projection;

\* token or context usage when NARS exposes it;

\* keyboard-first operation;

\* fuzzy selectors;

\* overlays rather than full-screen mode switches where appropriate;

\* good terminal resize behavior;

\* image and artifact support where terminal capabilities permit;

\* configurable themes;

\* command completion;

\* queued-input visibility;

\* clear active, blocked, failed, interrupted, and recovering states.



Do not copy Pi behavior when it conflicts with NARS semantics.



Examples:



\* Pi provider telemetry must not become canonical conversation.

\* Pi-style `!command` must not execute a local shell directly.

\* Pi `/model` behavior must route through admitted NARS intelligence reconfiguration.

\* Pi session branching must not be implemented unless NARS owns an explicit branching contract.

\* Pi extension UI must not imply arbitrary executable extensions inside the client.



\---



\# Local state



`agent-pi-tui` may own only presentation-local state:



```text

composer draft

composer history

focus

selection

overlay visibility

expanded/collapsed rows

scroll position

scroll-authority mode

current view

theme

terminal capability detection

connection status

ephemeral transport errors

pending-input presentation derived from NARS evidence

```



It must not own:



```text

canonical turn state

canonical transcript

provider continuation

tool lifecycle

session journal

input admission

session recovery truth

health truth

artifact authority

operational mutation authority

```



\## Scroll authority



Implement the shared modes:



```text

auto\_follow

operator\_controlled

force\_follow\_once

```



New events must not steal scroll position while the operator is reviewing earlier content.



\---



\# Input semantics



Classify input in this order:



```text

empty

non-slash conversation input

known slash command

unknown slash command

explicit raw protocol escape hatch, if admitted

```



\### Projection-local commands



Examples:



```text

/help

/clear

/view conversation

/view operations

/view diagnostics

/latest

/theme

```



These may change only local client state.



\### Direct NARS commands



Examples:



```text

/status

/health

/events

/recovery

/interrupt

/exit

```



These map deterministically to NARS protocol frames.



\### Runtime intelligence commands



Examples, only where the runtime exposes an admitted method:



```text

/model

/provider

/thinking

```



These must use `runtime.intelligence.reconfigure`.



\### Unknown commands



Unknown slash-prefixed input must produce a local validation message.



It must not be sent to the provider as ordinary conversation.



\### Shell syntax



Do not preserve Pi’s native:



```text

!command

!!command

```



as direct local shell execution.



Possible acceptable behavior:



```text

!command

&#x20; -> explicit structured NARS intent

&#x20; -> capability/admission surface

&#x20; -> execution only after runtime admission

```



Otherwise render it as unavailable.



\---



\# Extension posture



Do not embed Pi’s arbitrary executable extension runtime.



A later, separate design may support presentation extensions, but the first implementation must use a closed and safe boundary.



Allowed initial extension categories:



```text

theme

keybinding configuration

pure projection renderer

pure local command

pure local overlay

```



Disallowed categories:



```text

provider registration

tool registration

shell execution

filesystem mutation

event interception that changes NARS meaning

session mutation outside protocol controls

runtime process launch

credential access

```



Any future extension system must distinguish presentation extension from runtime capability.



\---



\# Launcher integration



Add a new operator-surface selection:



```text

agent-pi-tui

```



Expected launch-matrix row:



```json

{

&#x20; "launch\_selection\_kind": "agent-pi-tui",

&#x20; "operator\_surface\_kind": "agent-pi-tui",

&#x20; "carrier\_implementation\_kind": "narada-agent-runtime-server",

&#x20; "runtime\_host\_kind": "narada-agent-runtime-server",

&#x20; "runtime\_substrate\_kind": "narada-agent-runtime-server",

&#x20; "tool\_fabric\_adapter\_kind": "narada-agent-runtime-server-mcp-client",

&#x20; "tool\_fabric\_source": ".ai/mcp",

&#x20; "adapter\_entrypoint": "package:@narada2/agent-runtime-server#narada-agent-runtime-server",

&#x20; "projection\_capabilities": \[

&#x20;   "nars\_attach"

&#x20; ],

&#x20; "states": \[

&#x20;   "runtime\_known",

&#x20;   "adapter\_selected",

&#x20;   "source\_declared",

&#x20;   "launch\_ready"

&#x20; ]

}

```



Launch topology:



```text

agent-start

&#x20; -> create or resolve NARS session

&#x20; -> start narada-agent-pi-tui

&#x20; -> pass NARS attach endpoint and session identity

&#x20; -> client replays and attaches

```



The `agent-pi-tui` process must never be selected as:



```text

runtime\_host\_kind

runtime\_substrate\_kind

carrier\_implementation\_kind

```



\---



\# Relationship to existing `pi` carrier



Keep the existing independent `pi` carrier conceptually separate during migration.



```text

pi

&#x20; = independent Pi runtime/carrier



agent-pi-tui

&#x20; = NARS projection using Pi-style terminal presentation

```



Do not silently redirect `pi` to `agent-pi-tui`.



Do not reuse the same enum value.



The eventual product decision may retain, deprecate, or remove the independent Pi carrier, but that is outside this task.



\---



\# Cross-client conformance



Use the same shared event fixtures for:



```text

agent-cli

agent-tui

agent-web-ui

agent-pi-tui

```



Assert semantic equivalence, not pixel equivalence.



Required fixture cases:



\* initial attach;

\* bounded replay;

\* replay/live overlap;

\* ordinary user input;

\* input queued during active turn;

\* steering delivery;

\* canonical assistant completion;

\* assistant streaming;

\* tool request;

\* tool admitted;

\* tool refused;

\* tool execution;

\* tool result;

\* reconciliation;

\* runtime health degradation;

\* provider failure;

\* cancellation;

\* recovery recommendation;

\* artifact registration;

\* reconnect;

\* duplicate event;

\* intelligence reconfiguration;

\* session close;

\* unknown slash command;

\* unsupported command;

\* operator-controlled transcript scroll.



For each fixture assert:



```text

same canonical event ordering

same projection class

same semantic row kind

same render key

same durable acknowledgment interpretation

same input-delivery phase

same command-to-protocol mapping

same session terminal result

```



\---



\# PTY and live acceptance



\## PTY acceptance



Verify:



\* terminal enter and leave are clean;

\* no blank initial frame;

\* resize does not corrupt layout;

\* composer draft survives event updates;

\* overlays receive and release focus correctly;

\* bracketed paste is handled;

\* Unicode width is stable;

\* streamed messages update without duplicate rows;

\* tool output expand/collapse works;

\* operator scroll is not stolen;

\* Ctrl+C and Escape follow documented semantics;

\* process exit restores terminal state.



\## Live NARS acceptance



1\. Start one real NARS session.

2\. Attach `agent-cli`.

3\. Attach `agent-web-ui`.

4\. Attach `agent-tui`.

5\. Attach `agent-pi-tui`.

6\. Submit a turn from `agent-pi-tui`.

7\. Confirm all four clients observe the same canonical user and assistant events.

8\. Trigger a tool call and confirm the same operations evidence appears everywhere.

9\. Queue steering input from another client.

10\. Confirm `agent-pi-tui` reconciles pending input from durable events.

11\. Disconnect and reconnect `agent-pi-tui`.

12\. Confirm no duplicate execution and no duplicate canonical rows.

13\. Close only `agent-pi-tui`; confirm NARS remains active.

14\. Reattach `agent-pi-tui`.

15\. Close the session through an admitted NARS control.

16\. Confirm every attached client observes the durable close.



\---



\# Migration sequence



Implement in bounded slices:



\## Slice 1: Package and static rendering



\* create package and binary;

\* add `@earendil-works/pi-tui`;

\* render static transcript fixtures;

\* implement terminal lifecycle;

\* implement Pi-style theme and layout.



\## Slice 2: Shared projection consumption



\* consume or generate the NARS client projection contract;

\* implement `PiRowViewModel`;

\* render conversation, operations, diagnostics, and raw fixtures;

\* prove no local event classifier exists.



\## Slice 3: Read-only NARS attachment



\* attach to running NARS;

\* replay durable events;

\* subscribe to live events;

\* render session identity, health, and transcript;

\* implement reconnect and deduplication.



\## Slice 4: Operator input



\* implement composer;

\* implement ordinary `session.submit`;

\* implement steering or queued delivery mode;

\* implement pending-input reconciliation;

\* implement deterministic slash commands.



\## Slice 5: Runtime controls and artifacts



\* health;

\* recovery;

\* cancellation;

\* close;

\* intelligence reconfiguration;

\* artifacts;

\* operation and diagnostics views.



\## Slice 6: Launcher admission



\* add operator-surface enum;

\* add launch-matrix row;

\* update launch planning;

\* start NARS first and attach the client;

\* add package and artifact resolution.



\## Slice 7: Conformance and live acceptance



\* add shared client fixture suite;

\* add PTY tests;

\* add four-client live acceptance;

\* add reconnect and ambiguity tests.



\## Slice 8: Hardening



\* remove temporary duplicated projection tables;

\* ensure no Pi runtime dependencies remain;

\* audit package dependency graph;

\* document licensing and upstream provenance;

\* document unsupported Pi behaviors;

\* publish final ownership ledger.



\---



\# Guardrails



\* Do not import or instantiate Pi `AgentSession`.

\* Do not import or instantiate Pi `AgentSessionRuntime`.

\* Do not launch `pi --mode rpc`.

\* Do not use Pi `RpcClient`.

\* Do not use Pi session files as canonical state.

\* Do not host MCP servers.

\* Do not execute providers.

\* Do not register agent tools.

\* Do not run local shell commands.

\* Do not maintain a client-local canonical turn FSM.

\* Do not classify raw NARS events independently.

\* Do not treat socket writes as durable admission.

\* Do not automatically retry ambiguous submissions.

\* Do not treat provider telemetry as canonical assistant conversation.

\* Do not make themes or preferences mutate session state.

\* Do not add hidden flags that enable Pi runtime behavior.

\* Do not modify `agent-cli`, `agent-tui`, or `agent-web-ui` semantics merely to imitate Pi.



\---



\# Deliverables



\* `@narada2/agent-pi-tui` package;

\* `narada-agent-pi-tui` binary;

\* Pi-TUI-based terminal lifecycle;

\* Pi-style composer and transcript presentation;

\* NARS attachment client;

\* shared projection-contract consumption;

\* operator-input and slash-command mapping;

\* replay, reconnect, and deduplication;

\* health, recovery, cancel, close, and artifact support;

\* intelligence reconfiguration where admitted;

\* launcher enum and launch-matrix integration;

\* shared four-client conformance fixtures;

\* PTY test suite;

\* live four-client acceptance test;

\* dependency and ownership audit;

\* upstream Pi attribution and license notices;

\* architecture documentation.



\---



\# Completion criteria



The task is complete only when all are true:



\* `agent-pi-tui` attaches to an existing NARS session.

\* `agent-pi-tui` cannot act as a runtime host.

\* `agent-pi-tui` does not execute providers.

\* `agent-pi-tui` does not host MCP servers.

\* `agent-pi-tui` does not execute Pi tools.

\* `agent-pi-tui` does not use Pi session persistence.

\* `agent-pi-tui` does not launch Pi RPC mode.

\* `agent-pi-tui` consumes shared NARS projection semantics.

\* `agent-pi-tui` renders through `@earendil-works/pi-tui`.

\* Pi-style presentation components consume Narada-owned view models.

\* Unknown slash commands never reach the provider.

\* Shell syntax does not bypass NARS admission.

\* Reconnect does not duplicate execution or canonical rows.

\* Closing the client does not close the NARS session.

\* All four NARS surfaces can attach concurrently.

\* All four surfaces agree on canonical conversation and operations semantics.

\* The launch matrix contains `agent-pi-tui` as a NARS-backed operator surface.

\* The independent `pi` carrier remains a separate enum member.

\* No hidden compatibility path turns `agent-pi-tui` into a Pi runtime.

\* Documentation describes:



```text

NARS

&#x20; -> agent-cli

&#x20; -> agent-tui

&#x20; -> agent-web-ui

&#x20; -> agent-pi-tui

```



with all four as sibling operator projections.


## Execution Notes

- Implemented `@narada2/agent-pi-tui` and the `narada-agent-pi-tui` binary as a
  NARS-only projection client using `@earendil-works/pi-tui` for terminal
  rendering.
- Added Narada-owned attach, bounded replay, live subscription, durable cursor
  reconnect, overlap deduplication, input-delivery tracking, health/recovery,
  cancellation, close, artifact, and intelligence-reconfiguration adapters.
- Added shared projection-contract fixtures and deterministic Pi row models for
  conversation, operations, diagnostics, raw events, status, and artifacts.
- Added local composer, history, slash classification, fuzzy selectors,
  themes, scroll-authority modes, renderer components, PTY-model acceptance,
  and live NARS attachment coverage.
- Integrated the package into the NARS client registry, operator launch matrix,
  CLI launch planning/preflight, and `agent-start` runtime ownership wiring.
- Preserved the existing independent `pi` carrier. The new package contains no
  Pi agent runtime, provider, tool, extension, shell, or session-persistence
  authority.

## Verification

- `pnpm --filter @narada2/agent-pi-tui typecheck` — passed.
- `pnpm --filter @narada2/agent-pi-tui test` — passed (5 files, 16 tests).
- `pnpm --filter @narada2/agent-pi-tui build` — passed.
- `pnpm --filter @narada2/nars-client-projection-contract test` — passed.
- `pnpm --filter @narada2/operator-surface-runtime-contract test` — passed.
- `pnpm --filter @narada2/agent-start test:option-contract` — passed.
- CLI typecheck and focused launcher/admission tests — passed.
- Static dependency/source audit found no forbidden Pi runtime identifiers or
  launch paths in the new package.

## Acceptance Criteria

- [x] `agent-pi-tui` attaches to an existing NARS session without becoming a
  runtime host, provider executor, MCP host, or Pi tool executor.
- [x] Shared NARS projection semantics, input framing, replay/reconnect,
  deduplication, ambiguity handling, controls, artifacts, and local scroll
  authority are implemented and fixture-tested.
- [x] Rendering uses the public `@earendil-works/pi-tui` substrate and local
  presentation state does not become canonical NARS state.
- [x] The launch matrix and CLI/agent-start integration identify
  `agent-pi-tui` as a NARS-backed operator projection while keeping `pi`
  separate.
- [x] Architecture, ownership, unsupported-behavior, and upstream-license
  documentation are included.

## Residuals / Deferred Work

- The live acceptance test uses four concurrent NARS projection clients against
  a real runtime event hub; running four separate interactive binaries still
  depends on the host's terminal/session orchestration and was not run as part
  of focused package verification.
- The broad CLI launcher test has one pre-existing stale expectation for
  `--launch-binding` on hidden NARS launches; the Pi-specific launcher tests
  pass. The repository-wide verify suggestion command was also blocked by a
  pnpm packaged-runtime `EPERM` while probing `C:\Users\Andrey`.



```

```



