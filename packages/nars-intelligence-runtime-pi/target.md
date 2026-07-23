````md

\# Task: Implement a Pi-composed intelligence kernel behind NARS



\## Objective



Create a Pi-backed implementation of the NARS intelligence/provider execution boundary while preserving all public NARS semantics and authority boundaries.



Target architecture:



```text

&#x20;                        NARS public contract

&#x20;                 ┌────────────────────────────┐

&#x20;                 │ agent-runtime-server       │

&#x20;                 │ nars-session-core          │

&#x20;                 │ durable event journal      │

&#x20;                 │ health / recovery          │

&#x20;                 │ artifacts                  │

&#x20;                 │ capability admission       │

&#x20;                 └──────────────┬─────────────┘

&#x20;                                │

&#x20;                       NARS kernel contract

&#x20;                                │

&#x20;                 ┌──────────────▼─────────────┐

&#x20;                 │ @narada2/nars-pi-kernel    │

&#x20;                 │                            │

&#x20;                 │ Pi ModelRuntime            │

&#x20;                 │ Pi AgentSession            │

&#x20;                 │ provider adapters          │

&#x20;                 │ model loop                 │

&#x20;                 │ compaction / retry         │

&#x20;                 │ restricted tool bridge     │

&#x20;                 └──────────────┬─────────────┘

&#x20;                                │

&#x20;                   NARS capability gateway

&#x20;                                │

&#x20;                   governed Site capabilities

````



The implementation must use Pi as a replaceable cognition and provider-execution substrate.



It must not make Pi the canonical owner of:



\* Narada Agent identity;

\* NARS session identity;

\* input admission;

\* idempotency;

\* turn lifecycle;

\* canonical conversation;

\* durable event ordering;

\* tool admission;

\* operational authority;

\* external-effect confirmation;

\* recovery;

\* artifacts;

\* client attachment.



\## Canonical definition



> `nars-pi-kernel` is an implementation of the NARS intelligence-kernel contract using Pi SDK or Pi RPC components. Pi owns provider cognition mechanics inside one admitted turn; NARS remains authoritative for session control, durable evidence, capabilities, and effects.



\## Required invariant



```text

Pi may implement cognition.



Pi must not become session authority,

capability authority,

effect authority,

or client protocol authority.

```



A client must not be able to determine whether the active kernel is Narada-native, Pi SDK, Pi RPC, or another future implementation by observing:



\* NARS protocol methods;

\* canonical event shapes;

\* session identity;

\* turn lifecycle;

\* input-delivery semantics;

\* tool admission semantics;

\* artifact behavior;

\* recovery behavior;

\* client projections.



\---



\# Package and enum design



Create a package such as:



```text

packages/nars-intelligence-runtime-pi/

```



Suggested package identity:



```json

{

&#x20; "name": "@narada2/nars-pi-kernel",

&#x20; "version": "0.1.0",

&#x20; "type": "module",

&#x20; "private": true,

&#x20; "narada": {

&#x20;   "package\_role": "nars\_intelligence\_kernel",

&#x20;   "implements": "@narada2/nars-intelligence-kernel-contract",

&#x20;   "substrate": "@earendil-works/pi-coding-agent"

&#x20; }

}

```



Add a kernel-selection enum separate from operator-surface selection:



```ts

export type IntelligenceKernelKind =

&#x20; | "narada-native"

&#x20; | "pi-sdk"

&#x20; | "pi-rpc"

```



Operator surfaces remain independent:



```ts

export type OperatorSurfaceKind =

&#x20; | "agent-cli"

&#x20; | "agent-tui"

&#x20; | "agent-web-ui"

&#x20; | "agent-pi-tui"

```



Valid launch combinations must include:



```json

{

&#x20; "operator\_surface\_kind": "agent-web-ui",

&#x20; "runtime\_host\_kind": "narada-agent-runtime-server",

&#x20; "intelligence\_kernel\_kind": "pi-sdk"

}

```



and:



```json

{

&#x20; "operator\_surface\_kind": "agent-pi-tui",

&#x20; "runtime\_host\_kind": "narada-agent-runtime-server",

&#x20; "intelligence\_kernel\_kind": "pi-sdk"

}

```



The surface must not determine the intelligence kernel.



\---



\# Kernel contract



Create or formalize a representation-neutral NARS intelligence-kernel contract.



Suggested shape:



```ts

export interface NarsIntelligenceKernel {

&#x20; start(context: NarsKernelStartContext): Promise<NarsKernelStartEvidence>



&#x20; runTurn(

&#x20;   turn: NarsAdmittedTurn,

&#x20;   eventSink: NarsKernelEventSink,

&#x20;   capabilityGateway: NarsKernelCapabilityGateway

&#x20; ): Promise<NarsKernelTurnResult>



&#x20; steer(

&#x20;   input: NarsAdmittedInput

&#x20; ): Promise<NarsKernelInputAcceptance>



&#x20; cancel(

&#x20;   request: NarsKernelCancelRequest

&#x20; ): Promise<NarsKernelCancellationEvidence>



&#x20; reconfigure(

&#x20;   request: NarsKernelReconfigurationRequest

&#x20; ): Promise<NarsKernelReconfigurationEvidence>



&#x20; inspect(): Promise<NarsKernelHealthProjection>



&#x20; close(

&#x20;   request: NarsKernelCloseRequest

&#x20; ): Promise<NarsKernelCloseEvidence>

}

```



The kernel contract must not expose Pi-native types.



Do not expose:



```text

AgentSession

AgentSessionEvent

SessionManager

ModelRuntime

Pi message types

Pi tool-call types

Pi session entries

Pi extension APIs

Pi RPC commands

```



All Pi-specific objects must remain behind `@narada2/nars-pi-kernel`.



\---



\# Proposed internal layout



```text

packages/nars-intelligence-runtime-pi/

&#x20; package.json



&#x20; src/

&#x20;   index.ts

&#x20;   kernel.ts

&#x20;   kernel-config.ts



&#x20;   pi/

&#x20;     pi-sdk-host.ts

&#x20;     pi-rpc-host.ts

&#x20;     pi-session-factory.ts

&#x20;     pi-model-runtime.ts

&#x20;     pi-runtime-isolation.ts

&#x20;     pi-version-capabilities.ts



&#x20;   adapters/

&#x20;     input-adapter.ts

&#x20;     event-adapter.ts

&#x20;     message-adapter.ts

&#x20;     tool-adapter.ts

&#x20;     model-adapter.ts

&#x20;     compaction-adapter.ts

&#x20;     retry-adapter.ts

&#x20;     cancellation-adapter.ts

&#x20;     health-adapter.ts

&#x20;     recovery-adapter.ts



&#x20;   state/

&#x20;     continuation-state.ts

&#x20;     turn-correlation.ts

&#x20;     request-correlation.ts

&#x20;     provider-binding.ts



&#x20;   contracts/

&#x20;     pi-capability-profile.ts

&#x20;     pi-event-normalization.ts

&#x20;     pi-session-posture.ts



&#x20;   test/

&#x20;     fixtures/

&#x20;     kernel-contract.test.ts

&#x20;     event-normalization.test.ts

&#x20;     tool-gateway.test.ts

&#x20;     recovery.test.ts

&#x20;     live-pi-sdk.test.ts

&#x20;     live-pi-rpc.test.ts

```



Names may vary, but the ownership boundaries must remain explicit.



\---



\# Preferred implementation: Pi SDK in-process



Use Pi’s SDK directly as the primary implementation.



Expected composition:



```text

agent-runtime-server

&#x20; -> nars-session-core

&#x20;     -> nars-pi-kernel

&#x20;         -> ModelRuntime

&#x20;         -> createAgentSession(...)

&#x20;         -> AgentSession

```



Use an in-memory or NARS-backed Pi session manager.



Do not use Pi’s normal user session directory as canonical storage.



Suggested initialization posture:



```ts

const modelRuntime = await ModelRuntime.create({

&#x20; // Explicit Narada-projected provider configuration only.

})



const { session } = await createAgentSession({

&#x20; modelRuntime,

&#x20; sessionManager: SessionManager.inMemory(),

&#x20; tools: narsGatewayProxyTools,

&#x20; // Disable ambient Pi resources and extensions.

})

```



The exact SDK calls may differ. Preserve the architectural posture even if Pi APIs require wrappers.



\## SDK isolation requirements



Suppress ambient Pi behavior unless explicitly admitted:



\* global Pi extensions;

\* project-local Pi extensions;

\* Pi packages;

\* Pi skills not projected by Narada;

\* Pi prompt templates not projected by Narada;

\* ambient provider credentials not selected by `agent-start`;

\* project-local Pi system prompt replacement;

\* native Pi shell tools;

\* native Pi file-mutation tools;

\* user Pi session directories;

\* automatic trust decisions outside Narada launch context.



Use explicit configuration and pinned package versions.



\---



\# Transitional implementation: Pi RPC subprocess



Optionally implement:



```text

intelligence\_kernel\_kind: pi-rpc

```



Topology:



```text

agent-runtime-server

&#x20; -> nars-pi-kernel RPC adapter

&#x20;     -> pi --mode rpc

```



The adapter must:



\* spawn a pinned Pi version;

\* use strict JSONL framing;

\* correlate NARS request IDs with Pi RPC request IDs;

\* supervise process exit and malformed output;

\* translate Pi RPC events into NARS kernel events;

\* refuse unsupported or unsafe Pi RPC commands;

\* prevent Pi RPC session state from becoming canonical;

\* close or kill the subprocess deterministically.



Pi RPC mode is an implementation detail, not a public NARS protocol.



Do not route NARS clients directly to Pi RPC.



\---



\# Session-state ownership



\## Canonical rule



```text

NARS journal = canonical session truth

Pi session   = derived cognition continuation state

```



Pi may retain enough internal state to continue provider cognition, but it must not independently define:



\* accepted user inputs;

\* canonical assistant messages;

\* turn outcomes;

\* tool admissions;

\* session close;

\* recovery state.



\## Recommended first implementation



Use:



```text

SessionManager.inMemory()

```



Reconstruct Pi context from NARS-owned records when starting or recovering a kernel.



Define a deterministic context-builder:



```ts

interface NarsPiContextBuilder {

&#x20; buildContext(

&#x20;   session: NarsSessionSnapshot,

&#x20;   turn: NarsAdmittedTurn

&#x20; ): Promise<PiContextProjection>

}

```



The context projection may include:



\* canonical user and assistant messages;

\* admitted tool results;

\* compaction summary;

\* active system posture;

\* bounded recent history;

\* provider continuation metadata where safe.



It must not infer canonical state from Pi’s session tree.



\## Later optimization



A NARS-backed Pi `SessionManager` adapter may be introduced only after proving:



\* one writable source of truth;

\* deterministic reconstruction;

\* no independent branch authority;

\* no conflict between Pi tree semantics and NARS event semantics;

\* crash recovery without duplicate turns.



\---



\# Input admission and queue semantics



NARS admission must occur before Pi receives input.



Required sequence:



```text

client request

&#x20; -> NARS runtime-request admission

&#x20; -> input idempotency check

&#x20; -> durable input accepted/queued record

&#x20; -> turn creation or delivery-mode decision

&#x20; -> nars-pi-kernel prompt / steer / follow-up

&#x20; -> Pi acceptance

&#x20; -> Pi execution

&#x20; -> normalized NARS events

```



Pi queue semantics are execution mechanisms only.



Map:



```text

NARS immediate turn      -> Pi prompt

NARS operator steering   -> Pi steer

NARS admitted follow-up  -> Pi follow-up

NARS cancellation        -> Pi abort/cancel

```



Do not let a Pi acceptance response determine whether NARS admitted input.



Do not automatically resend input when it is unclear whether Pi received it.



Maintain correlation among:



```text

runtime\_request\_id

input\_id

idempotency\_key

turn\_id

turn\_attempt

Pi request id

Pi session id

Pi message id

Pi tool-call id

```



Create an explicit correlation registry with bounded retention.



\---



\# Event normalization



Pi events must never be emitted directly as canonical NARS events.



Required flow:



```text

Pi event

&#x20; -> PiEventAdapter

&#x20; -> kernel observation

&#x20; -> nars-session-core transition

&#x20; -> durable NARS event

&#x20; -> client projection

```



The event adapter must classify Pi events as:



```text

provider telemetry

assistant streaming fragment

assistant message candidate

tool request

tool execution telemetry

tool result candidate

retry telemetry

compaction telemetry

usage telemetry

turn completion candidate

turn failure candidate

cancellation evidence

kernel failure

```



NARS session-core remains responsible for emitting canonical:



```text

user\_message

assistant\_message

turn\_lifecycle\_transition

tool\_requested

tool\_admitted

tool\_refused

tool\_execution\_started

tool\_result\_received

turn\_complete

turn\_failed

turn\_interrupted

```



Provider message completion must not automatically become canonical `assistant\_message` until the NARS turn coordinator accepts it as the terminal or current canonical assistant output.



Provider telemetry may be preserved in diagnostics.



\## Event ordering



Guarantee deterministic ordering between:



\* NARS input-admission events;

\* Pi provider events;

\* tool lifecycle events;

\* canonical assistant events;

\* turn terminal events.



The adapter must not depend on incidental JavaScript callback scheduling.



\---



\# Tool and capability boundary



This is the most important boundary.



The Pi session must receive only NARS gateway proxy tools.



Target flow:



```text

Pi requests tool

&#x20; -> NARS proxy tool

&#x20; -> nars-capability-gateway

&#x20; -> capability lookup

&#x20; -> action classification

&#x20; -> admission or refusal

&#x20; -> execution attempt

&#x20; -> tool result evidence

&#x20; -> reconciliation

&#x20; -> structured result returned to Pi

```



\## Disable direct Pi tools



Do not provide unrestricted Pi-native:



```text

read

write

edit

bash

shell

filesystem mutation

process execution

network mutation

provider-native mutation tools

```



If read-only local capabilities are required, expose them through explicit NARS capability-gateway tools.



\## Tool proxy contract



Suggested interface:



```ts

interface NarsPiToolProxy {

&#x20; name: string

&#x20; description: string

&#x20; inputSchema: unknown



&#x20; execute(

&#x20;   request: PiToolRequest,

&#x20;   context: NarsToolInvocationContext

&#x20; ): Promise<PiCompatibleToolResult>

}

```



Every proxy call must carry:



\* `agent\_id`;

\* `session\_id`;

\* `turn\_id`;

\* `tool\_call\_id`;

\* capability identity;

\* authority posture;

\* admission evidence;

\* execution evidence;

\* result reference;

\* reconciliation state where applicable.



A Pi tool success response is not external-effect confirmation.



\---



\# Extension posture



Do not load ambient Pi extensions.



The initial implementation must use:



```text

no user extensions

no project extensions

no npm Pi packages

no global Pi package discovery

```



Allowed kernel additions must be:



\* Narada-owned;

\* package-pinned;

\* audited;

\* explicitly registered by `nars-pi-kernel`;

\* incapable of bypassing the capability gateway.



Do not expose the full Pi extension API to Sites or clients.



A later reduced extension API may permit:



```text

provider telemetry observer

pure context transformer

pure message formatter

pure diagnostic hook

```



It must not permit:



```text

tool registration

shell execution

filesystem mutation

provider credential access

session persistence

process launch

turn lifecycle override

client event emission

```



\---



\# Provider and model configuration



`agent-start` remains responsible for resolving:



\* provider;

\* model;

\* thinking level;

\* credentials;

\* endpoint/base URL;

\* allowed provider posture.



The Pi kernel consumes resolved configuration.



It must not:



\* discover a different provider from ambient Pi config;

\* prompt for login;

\* read unrelated global Pi authentication state unless explicitly selected as the admitted credential source;

\* silently switch models;

\* persist provider/model selection as Pi user configuration.



Map NARS intelligence reconfiguration to Pi model/runtime operations.



Required flow:



```text

runtime.intelligence.reconfigure

&#x20; -> NARS validation

&#x20; -> clean-turn-boundary check

&#x20; -> Pi kernel model/provider switch

&#x20; -> kernel verification

&#x20; -> active binding transition

&#x20; -> durable NARS evidence

```



Never pass raw credentials through client protocol events.



\---



\# Compaction and context management



Pi may implement the compaction algorithm, but NARS must own the durable meaning.



Required distinction:



```text

Pi compaction operation

&#x20; != NARS canonical history deletion

```



Pi may produce:



\* summary candidate;

\* retained-context cursor;

\* token estimates;

\* provider-specific compression metadata.



NARS must decide:



\* whether the summary is accepted;

\* how it is recorded;

\* which canonical history remains reconstructable;

\* how recovery rebuilds context;

\* whether compaction changes client projections.



Record compaction as durable evidence.



Do not discard canonical NARS events merely because Pi compacted its context.



\---



\# Retry and failure semantics



Pi may implement provider-level transient retry.



NARS must remain authoritative for turn lifecycle.



Distinguish:



```text

provider request retry

kernel turn retry

NARS turn attempt retry

client input resubmission

```



These must not collapse.



Required behavior:



\* Pi transient retry stays within the current NARS turn attempt where safe.

\* Exhausted provider retry becomes kernel failure evidence.

\* A new NARS attempt requires an explicit session-core transition.

\* Client retry after ambiguous admission must preserve the original idempotency key.

\* Pi process failure must not silently start a duplicate turn.



\---



\# Cancellation



Required sequence:



```text

session.cancel

&#x20; -> NARS cancellation requested

&#x20; -> kernel cancel/abort

&#x20; -> provider/tool interruption

&#x20; -> capability-gateway closeout

&#x20; -> durable turn interrupted or failed

```



Cancellation must account for:



\* provider streaming;

\* Pi retry delay;

\* active tool execution;

\* queued steering;

\* queued follow-up input;

\* subprocess termination in `pi-rpc` mode.



A cancellation request being sent is not proof that execution stopped.



\---



\# Health and recovery



Expose kernel-specific data only through NARS health projections.



Suggested kernel health fields:



```text

kernel\_kind

kernel\_version

pi\_version

pi\_mode

provider

model

thinking

kernel\_state

active\_turn\_id

provider\_streaming

compaction\_state

retry\_state

continuation\_state\_present

capability\_profile

last\_kernel\_error

```



Do not expose raw credentials or ambient Pi configuration.



Recovery must define behavior for:



\* NARS restart;

\* Pi SDK session reconstruction;

\* Pi RPC process crash;

\* partial provider output;

\* accepted turn with no terminal event;

\* tool execution with unknown outcome;

\* compaction interruption;

\* model reconfiguration interruption;

\* corrupted Pi continuation state;

\* Pi/NARS version mismatch.



NARS recovery recommendations remain canonical.



\---



\# Artifacts



Pi-generated files or large outputs must be registered through NARS artifact ownership.



Required flow:



```text

Pi/provider/tool output

&#x20; -> kernel detects artifact candidate

&#x20; -> NARS artifact registration

&#x20; -> durable artifact event

&#x20; -> client presentation reference

```



Do not expose arbitrary Pi filesystem paths as canonical artifact identities.



\---



\# Version and capability negotiation



At kernel startup, record:



```text

Pi package version

kernel adapter version

SDK or RPC mode

supported Pi capabilities

supported provider features

supported thinking levels

tool-posture version

event-adapter version

session posture

ambient resource isolation posture

```



Fail closed when:



\* the Pi event vocabulary is unsupported;

\* required SDK operations are missing;

\* native tools cannot be disabled;

\* ambient extensions cannot be suppressed;

\* provider/model configuration is contradictory;

\* the adapter cannot establish deterministic event correlation.



Pin Pi versions until explicit compatibility evidence exists.



\---



\# Runtime integration



Update NARS provider/runtime construction to select a kernel:



```ts

switch (kernelKind) {

&#x20; case "narada-native":

&#x20;   return createNaradaNativeKernel(config)



&#x20; case "pi-sdk":

&#x20;   return createNarsPiSdkKernel(config)



&#x20; case "pi-rpc":

&#x20;   return createNarsPiRpcKernel(config)

}

```



The runtime server and session core must not branch on Pi-specific semantics after construction.



All kernels must satisfy the same contract tests.



\---



\# Launch configuration



Add kernel selection to launch materialization.



Example:



```json

{

&#x20; "runtime\_host\_kind": "narada-agent-runtime-server",

&#x20; "operator\_surface\_kind": "agent-web-ui",

&#x20; "intelligence\_kernel\_kind": "pi-sdk",

&#x20; "provider": "openai-codex",

&#x20; "model": "gpt-5.6",

&#x20; "authority": "read"

}

```



Environment or launch packet fields may include:



```text

NARADA\_INTELLIGENCE\_KERNEL=pi-sdk

NARADA\_INTELLIGENCE\_PROVIDER=openai-codex

NARADA\_AI\_MODEL=gpt-5.6

NARADA\_AI\_THINKING=high

```



Do not allow the client to select an unadmitted kernel through a normal chat message.



\---



\# Relationship to existing Pi carrier



Keep these concepts separate:



```text

pi

&#x20; = independent Pi runtime and operator surface



agent-pi-tui

&#x20; = NARS client using Pi’s TUI substrate



nars-pi-kernel

&#x20; = NARS cognition kernel using Pi’s SDK or RPC runtime

```



Do not silently redirect the independent `pi` carrier to NARS.



Do not use the same enum for:



\* operator surface;

\* runtime host;

\* intelligence kernel.



\---



\# Verification strategy



\## Kernel contract suite



Run the same contract suite against:



```text

narada-native

pi-sdk

pi-rpc

```



Assert equivalent NARS semantics for:



\* start;

\* ordinary turn;

\* assistant streaming;

\* tool request;

\* admitted tool;

\* refused tool;

\* tool result;

\* turn completion;

\* cancellation;

\* provider failure;

\* retry exhaustion;

\* model reconfiguration;

\* health;

\* close.



\## Event normalization fixtures



Create Pi event fixtures for:



\* assistant token stream;

\* assistant completion;

\* tool call;

\* tool result;

\* retry;

\* compaction;

\* cancellation;

\* provider failure;

\* malformed event;

\* duplicate event;

\* out-of-order event;

\* process exit.



Assert exact NARS output events.



\## Tool-boundary tests



Prove:



\* only gateway proxy tools are visible;

\* native Pi shell is unavailable;

\* native Pi write/edit are unavailable;

\* ambient extension tool registration is unavailable;

\* read-only gateway tool executes;

\* mutating gateway tool requires admission;

\* refused tool returns structured refusal to Pi;

\* tool result does not imply effect confirmation.



\## Session authority tests



Prove:



\* NARS journal can reconstruct a Pi SDK session;

\* deleting Pi continuation state does not delete canonical history;

\* Pi session state cannot introduce a canonical message;

\* duplicate Pi output cannot duplicate canonical assistant rows;

\* NARS close remains terminal even if Pi internal state survives.



\## Crash and recovery tests



Cover:



\* Pi SDK exception before turn start;

\* exception after provider request;

\* exception during streaming;

\* Pi RPC process exit;

\* malformed JSONL;

\* accepted input followed by kernel crash;

\* tool execution with unknown outcome;

\* restart and reconstruction;

\* no duplicate provider execution after restart.



\---



\# Live acceptance



\## Pi SDK live proof



1\. Start a real NARS session with `intelligence\_kernel\_kind=pi-sdk`.

2\. Attach `agent-cli`.

3\. Attach `agent-web-ui`.

4\. Attach `agent-tui`.

5\. Optionally attach `agent-pi-tui`.

6\. Submit a turn.

7\. Confirm canonical events are identical to the native-kernel shape.

8\. Trigger a read-only NARS capability.

9\. Trigger a mutating capability and verify admission.

10\. Cancel an active turn.

11\. Reconfigure model or thinking at a clean boundary.

12\. Disconnect and reconnect clients.

13\. Restart the runtime and reconstruct Pi context.

14\. Confirm no duplicate input, tool execution, or assistant messages.

15\. Close the NARS session and verify terminal evidence.



\## Kernel substitutability proof



Run the same bounded scenario with:



```text

narada-native

pi-sdk

```



Compare:



```text

session identity

turn transitions

canonical conversation

tool lifecycle

artifact events

health shape

recovery shape

client projections

terminal session outcome

```



Provider telemetry may differ.



Canonical NARS semantics must not.



\---



\# Migration sequence



\## Slice 1: Kernel contract



\* formalize `NarsIntelligenceKernel`;

\* adapt the existing native provider runtime;

\* make current behavior pass kernel contract tests;

\* introduce kernel selection without changing behavior.



\## Slice 2: Pi SDK bootstrap



\* add pinned Pi dependencies;

\* create isolated `ModelRuntime`;

\* create in-memory `AgentSession`;

\* run one tool-free turn;

\* normalize assistant streaming and completion.



\## Slice 3: Input and lifecycle



\* implement prompt;

\* implement steering;

\* implement follow-up;

\* implement cancellation;

\* correlate Pi and NARS turn IDs;

\* preserve NARS admission ordering.



\## Slice 4: Capability gateway



\* remove all Pi native tools;

\* expose NARS proxy tools;

\* implement tool request/admission/result translation;

\* add refusal and mutation tests.



\## Slice 5: Context and compaction



\* reconstruct Pi context from NARS;

\* integrate Pi compaction;

\* preserve canonical history;

\* add restart and compaction recovery tests.



\## Slice 6: Reconfiguration and health



\* provider/model/thinking changes;

\* kernel capability negotiation;

\* health projection;

\* failure and recovery evidence.



\## Slice 7: Pi RPC adapter



\* implement optional subprocess mode;

\* add strict JSONL supervision;

\* run the same kernel contract suite;

\* document capability differences.



\## Slice 8: Launch and acceptance



\* add kernel enum and launch configuration;

\* add live multi-client tests;

\* prove native/Pi kernel substitutability;

\* publish ownership and dependency audit.



\---



\# Guardrails



\* Do not expose Pi-native types through public NARS APIs.

\* Do not make Pi session files canonical.

\* Do not load ambient Pi extensions.

\* Do not load ambient Pi packages.

\* Do not expose Pi-native tools.

\* Do not allow direct shell execution.

\* Do not let Pi decide input admission.

\* Do not let Pi decide canonical turn completion.

\* Do not forward Pi events directly to clients.

\* Do not let Pi provider telemetry become canonical conversation.

\* Do not let Pi tool success become effect confirmation.

\* Do not persist client-specific preferences into Pi kernel state.

\* Do not allow kernel selection to change session identity.

\* Do not add hidden compatibility paths that bypass NARS session-core.

\* Do not describe `Pi + Narada extension` as equivalent to NARS.

\* Do not modify clients to depend on Pi semantics.

\* Do not permit two writable session authorities.



\---



\# Deliverables



\* `@narada2/nars-intelligence-kernel-contract`;

\* native-kernel adapter conforming to the contract;

\* `@narada2/nars-pi-kernel`;

\* Pi SDK implementation;

\* optional Pi RPC implementation;

\* NARS-to-Pi input adapter;

\* Pi-to-NARS event normalizer;

\* NARS capability-gateway proxy tools;

\* isolated Pi runtime configuration;

\* NARS-owned context reconstruction;

\* compaction and retry adapters;

\* cancellation and recovery behavior;

\* health and capability negotiation;

\* kernel-selection enum;

\* launch integration;

\* kernel contract test suite;

\* tool-boundary tests;

\* crash and recovery tests;

\* live multi-client acceptance;

\* native-versus-Pi substitutability proof;

\* package dependency and authority audit;

\* architecture documentation;

\* upstream Pi licensing and attribution.



\---



\# Completion criteria



The task is complete only when all statements are true:



\* NARS can run with `intelligence\_kernel\_kind=pi-sdk`.

\* NARS can run with its native kernel using the same public contract.

\* Clients cannot distinguish kernels through canonical NARS semantics.

\* Pi does not own NARS session identity.

\* Pi does not own input admission.

\* Pi does not own canonical event ordering.

\* Pi does not own the durable transcript.

\* Pi does not own tool admission.

\* Pi native shell and mutation tools are unavailable.

\* Only NARS capability-gateway tools are visible to Pi.

\* Pi events are normalized before entering the NARS journal.

\* Provider telemetry remains diagnostic.

\* Canonical assistant messages are emitted by NARS.

\* Pi session state is reconstructable or disposable continuation state.

\* NARS restart does not duplicate execution.

\* Pi failure produces deterministic NARS recovery evidence.

\* Model and thinking reconfiguration occur through admitted NARS controls.

\* All existing NARS clients work without Pi-specific behavior.

\* Operator-surface selection is independent of kernel selection.

\* The independent Pi carrier remains a separate concept.

\* Kernel contract, crash, tool-boundary, and live acceptance tests pass.

\* Documentation describes:



```text

NARS contracts

&#x20; -> interchangeable intelligence kernels

&#x20;      ├── narada-native

&#x20;      ├── pi-sdk

&#x20;      └── pi-rpc

```



with Pi acting as an implementation substrate rather than the canonical runtime authority.



```

```



