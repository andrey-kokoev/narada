# Narada Agent Runtime Server

## Definition

A **Narada Agent Runtime Server** is a vendor-neutral, stateful, MCP-enabled intelligence runtime that embodies one durable Agent through a machine-addressable multi-turn control channel while preserving Narada authority boundaries.

It is the Narada-owned answer to:

```text
How can automation summon an intelligence session, speak to it across multiple turns, let it use local tools, and still keep judgment, authority, execution, and confirmation separated?
```

It is not merely "headless mode." Headless mode usually means:

```text
prompt in -> answer out -> process exits
```

A Narada Agent Runtime Server means:

```text
start durable Agent session
-> accept machine turns over a stable protocol
-> evaluate under bounded context
-> request local MCP/tool actions
-> route effects through governed Narada authority surfaces
-> emit structured events and evidence
-> remain addressable for the next turn
```

## De-Arbitrarized Core

The surface phrase "stateful local agent server" bundles several different structures. Agent Runtime Server preserves the following split:

| Term | Primitive meaning | Not this |
| --- | --- | --- |
| Runtime server | A long-lived control process or service that accepts machine turns for one bound Agent Session. | The model provider, a terminal tab, or the authority locus. |
| Session state | Durable conversation, launch, identity, tool posture, and event evidence needed to resume or reconstruct the Agent Session. | Task truth, inbox truth, mailbox truth, or effect confirmation. |
| Turn | One bounded automation input plus the resulting agent loop until completion, refusal, interruption, or blocked state. | An arbitrary stream of text with no lifecycle boundary. |
| Machine-addressable | Automation can address a specific Agent Session through a declared transport and session handle. | Any process that happens to read stdin. |
| Local tool execution | Requests to admitted local tool surfaces, normally MCP, with structured call/result evidence. | Native unrestricted shell or SDK-private tool execution. |
| Admission | The authority-bearing decision that a requested mutation, tool use, or effect may proceed. | The model choosing to call a tool. |

Agent Runtime Server is therefore not defined by being interactive or non-interactive. It is defined by this invariant:

```text
same Agent Session
+ addressable machine turns
+ governed local tool mediation
+ reconstructable event evidence
- authority collapse
```

## Canonical Name

Prefer **Narada Agent Runtime Server** when naming the concept.

Use **agent runtime server**, **agent server mode**, or **agent RPC runtime** as implementation shorthand.

Avoid using **headless agent** as the canonical term. It hides the important distinction between one-shot non-interactive execution and durable machine-addressable agency.

## Closure Posture

The runtime server is an **Invariant Closure** mechanism.

It must not make the model, vendor SDK, terminal, or carrier implementation the place where ambiguity closes into consequence.

The governing chain is:

```text
automation request
-> request admission
-> bounded context
-> intelligent evaluation
-> evaluation evidence
-> tool/effect admission
-> durable intent when mutation is requested
-> authorized execution
-> reconciliation when the outside world may have changed
-> structured event / observation
```

The model may produce judgment. The carrier may host the session. MCP tools may perform work. None of those facts grants authority.

The central rule remains:

```text
Intelligence may contribute judgment.
Authority must remain in governed structure.
```

The governed conversion boundary for requested effects is the [`Carrier Action Admission Boundary`](carrier-action-admission-boundary.md). Agent Runtime Server may produce or carry action requests, but that boundary decides whether a request becomes admission, refusal, deferral, or an inert candidate for another authority surface.

Session discovery, liveness, attachment, and recovery are specified in [`NARS Session Management`](nars-session-management.md).

The agent-context MCP stdio transport has its own protocol-session FSM:
`created -> initializing -> initialized -> serving -> closing -> closed`.
`tools/list` and `tools/call` require `serving`, and the current state/history
are exposed by `agent_context_doctor`. See [`Narada FSM Contracts`](nars-fsm-contracts.md).

## Runtime Request Lifecycle

The runtime server has a transport-level request FSM in addition to the
session, input-admission, turn, and shutdown FSMs. It describes the fate of
one JSONL control request; it does not replace any of those domain lifecycles.

```text
received
  -> scheduled
  -> running
  -> completed | rejected | failed

scheduled
  -> waiting
  -> running
```

waiting is used by session.close: the runtime waits for requests that were
already admitted, and then runs the session-close barrier. Close is graceful;
an operator that needs interruption sends session.cancel explicitly before
session.close. The close request reaches completed before the durable
session_closed event is emitted. A request that cannot be parsed or admitted
is rejected; a request whose admitted operation fails is failed.

Each transition is durable as runtime_request_state_transition with a
runtime-local request id and the caller-supplied request_id when present. The
health projection exposes aggregate runtime_requests counts. This evidence is
transport coordination, not provider output and not a substitute for
input-admission or turn events.

## Required Properties

A Narada Agent Runtime Server must:

- bind exactly one durable Agent identity for a bounded runtime session;
- expose a stable session address that automation can use after launch;
- expose a stable machine protocol for multi-turn input and structured events;
- keep session state durable enough for resume, audit, and reconstruction;
- discover or mount only admitted Site tool surfaces;
- route tool execution through Narada MCP or other governed capability surfaces;
- distinguish tool availability, request, approval/admission, execution attempt, result, and confirmation;
- emit reconstructable event traces for user turns, assistant messages, tool calls, tool results, refusals, handoffs, and terminal errors;
- preserve local authority routing when invoked from automation, daemon, terminal, UI, or another agent;
- allow model/provider substitution without changing Narada identity, authority, or trace semantics.

## Turn Lifecycle

An Agent Runtime Server turn has explicit lifecycle state. This prevents raw prompt streaming from silently becoming operational control.

```text
accepted
-> contextualized
-> evaluating
-> tool_requested*
-> tool_admitted_or_refused*
-> executing*
-> reconciling*
-> completed | blocked | interrupted | failed | refused
```

The `*` stages may occur zero or more times in one turn.

Each turn must record:

| Field | Meaning |
| --- | --- |
| `turn_id` | Durable id for the automation input and resulting loop. |
| `agent_id` | Bound durable Agent identity. |
| `session_id` | Bound Agent/Carrier Session. |
| `input_ref` | Inline input or durable reference to the automation request. |
| `authority_posture` | Policy posture under which tools/effects are admitted or refused. |
| `events` | Ordered event evidence emitted during the turn. |
| `terminal_state` | Completion, blockage, interruption, failure, or refusal. |

Agent Runtime Server must serialize turns for one Agent Session unless an explicit concurrency policy exists. Concurrent turn handling is not a default property of the concept.

## State Boundary

Agent Runtime Server owns runtime/session state, not operational truth.

It may persist:

- session identity and launch evidence;
- conversation history or summarized context;
- tool catalog snapshot and posture;
- turn/event traces;
- model/provider adapter metadata;
- resume handles;
- interruption and closeout evidence.

It must not treat its own state as the source of truth for:

- task lifecycle;
- inbox/mailbox admission;
- outbound send authority;
- external effect confirmation;
- Site law or capability grants;
- durable facts owned by another authority locus.

When Agent Runtime Server needs those objects, it reads or mutates them through the declared authority surfaces and records the crossing.

## Non-Claims

A Narada Agent Runtime Server is not:

- an Agent identity;
- a task lifecycle authority;
- an inbox or mailbox admission authority;
- an outbox/send authority;
- a shell executor by itself;
- a model provider SDK;
- a terminal multiplexer;
- an operator surface;
- a transcript file treated as authority.

It may use or expose these components. It must not become them.

## Protocol Shape

The default session-core control protocol is deliberately small and event-oriented.

Example request shape:

```json
{"method":"session.submit","params":{"content":"run startup sequence"}}
```

Example event shapes:

```json
{"event":"turn_started","session_id":"carrier_...","agent_id":"narada-andrey.Kevin"}
{"event":"assistant_message","content":"I will inspect the startup state first."}
{"event":"tool_call","tool":"startup_sequence","arguments":{}}
{"event":"tool_result","tool":"startup_sequence","status":"ok","output_ref":"mcp_output:o_..."}
{"event":"turn_complete","session_id":"carrier_..."}
```

The protocol should support at least:

| Operation | Purpose |
| --- | --- |
| `session.submit` or `content` | Submit one serialized automation/user turn. |
| `session.health` | Return the stable runtime health probe shape. |
| `session.events.subscribe` | Attach an event-stream consumer and optionally replay recent events. |
| `session.events.read` | Read a bounded event page from the session journal. |
| `session.cancel` | Request cancellation of active work. |
| `session.close` | Close or hand off the session with terminal evidence. |
| `session.recovery` | Inspect recovery recommendations and handoff commands. |
| Artifact HTTP routes | Register, read, serve, or present session-scoped artifacts through `/sessions/:id/artifacts`, `/content`, and `/message`. |

Artifact registration and content delivery are HTTP projection routes, not session-core control frames. The runtime wrapper delegates artifact persistence to session-core and publishes durable artifact and presentation events for event-stream consumers. Historical conversation, resume, status, command, observer, and affordance methods are compatibility protocol only; the default runtime rejects them until they are reintroduced through explicit session-core contracts.

The protocol may be transported over stdio, named pipe, local HTTP, WebSocket, or another local transport. The transport is an embodiment detail. The event and authority contract is the invariant.

## Parameterized Implementation Choices

The following freedoms are intentionally left explicit rather than hidden in the phrase "server":

| Choice | Allowed values | Constraint |
| --- | --- | --- |
| Transport | stdio, named pipe, local HTTP, WebSocket, daemon IPC, future local transport | Must carry the same request/event contract and session identity. |
| Process lifetime | per-session process, shared daemon with per-session workers, supervised service | Must keep Agent Session identity and event evidence distinct. |
| Event delivery | buffered JSON events, streaming JSONL, RPC notifications | Must be reconstructable after crash or disconnect. |
| Model adapter | Codex subscription, OpenAI API, Claude, Kimi, OpenRouter, local model, future provider | Must not own Narada authority or tool admission. |
| Tool substrate | MCP stdio, MCP HTTP, Narada-native capability surface, future adapter | Must expose governed call/result evidence. |
| Concurrency | serialized turns by default, explicit concurrent policy later | Must not permit split-brain mutation or ambiguous terminal state. |

These are parameters, not ontology. Changing one should not change what Agent Runtime Server is.

## Relationship To Agent Carriers

An [`Agent Carrier`](agent-carrier.md) is the runtime embodiment that carries one durable Agent through one bounded Carrier Session.

A Narada Agent Runtime Server is a carrier posture optimized for automation rather than human terminal inhabitation.

The split is:

| Layer | Meaning |
| --- | --- |
| Agent | Durable identity, role, posture, and history. |
| Carrier Session | One bounded embodiment of that Agent. |
| Agent Runtime Server | Machine-addressable carrier posture for multi-turn automation. |
| Model / provider adapter | Replaceable cognition substrate. |
| MCP / tool surfaces | Governed capability channels. |
| Authority loci | Site, task, inbox, outbox, effect, and confirmation authorities. |

Codex CLI, Claude Code, Pi, Kimi, and future model/provider SDKs may be substrates or carrier adapters. They must remain replaceable embodiments behind the Narada runtime protocol.

## Vendor-Neutrality Rule

Do not define the Narada Agent Runtime Server in terms of a vendor SDK.

Vendor SDKs may be useful adapters, but the runtime contract belongs to Narada. The stable protocol must survive replacing:

- OpenAI/Codex with Claude, Kimi, OpenRouter, local models, or future providers;
- a terminal TUI with a daemon;
- stdio with a named pipe or HTTP transport;
- one MCP client implementation with another.

If a vendor SDK owns the session semantics, tool admission, permission model, or event trace format, Narada has drifted toward Cognitive Closure. The SDK can be used only behind a Narada-owned adapter boundary.

## Quotiented Distinctions

For this concept, the following distinctions are decision-inert and should not be carried as separate ontology:

| Distinction | Quotient |
| --- | --- |
| `headless` vs `non-interactive` | Both are insufficient shorthand unless they expose durable multi-turn session control. |
| `RPC server` vs `daemon` | Transport/lifetime choices, not different concepts. |
| `local agent` vs `automation agent` | Same concept when the session is machine-addressable and authority-preserving. |
| `provider SDK` vs `model API` | Both are cognition adapters unless they try to own session/tool authority. |

The distinctions that must remain load-bearing are:

```text
session state != operational truth
tool request != tool admission
execution attempt != confirmation
transport connection != authority
model conversation != Agent identity
```

## Relationship To Existing Concepts

- [`Agent Carrier`](agent-carrier.md) defines the broader carrier/session/substrate split. The runtime server is a machine-addressable carrier posture.
- [`Carrier Action Admission Boundary`](carrier-action-admission-boundary.md) defines how carrier-produced action requests become governed admission decisions or inert candidates without authority collapse.
- [`Runtime-Invariant Adapter Contract`](runtime-invariant-adapter-contract.md) supplies the substrate-neutral adapter discipline. The runtime server must name and satisfy an invariant protocol.
- [`Plural Embodiment, Singular Authority`](plural-embodiment-singular-authority.md) explains why many automation callers, carriers, and transports may exist while governed mutation still resolves to one declared authority locus.
- [`Command Execution Intent Zone`](command-execution-intent-zone.md) governs requests to execute commands. The runtime server may request effects but must not let carrier convenience become execution authority.
- [`Runtime Identity Binding`](runtime-identity-binding.md) binds volatile runtime handles to durable Agent/Session evidence. Runtime server transports must expose enough identity and session evidence for that binding.

## Anti-Collapse Rules

- A live model conversation is not authority.
- A successful tool call is not confirmation.
- A vendor SDK session is not a Narada session unless bound through Narada launch/session evidence.
- A transport connection is not admission.
- A terminal, daemon, or RPC server is not the mutation locus.
- A transcript is evidence, not policy.
- A structured event stream is observation unless admitted by the relevant authority locus.

## First Implementation Direction

The implementation is the Narada-owned `@narada2/agent-runtime-server` package. It provides the `narada-agent-runtime-server` entrypoint and runs carrier execution in-process through `@narada2/carrier-runtime`.

Reason: NARS owns identity binding, session persistence, and event/session evidence for the live carrier runtime, while its provider-runtime and capability-gateway packages own provider turns, MCP discovery, tool dispatch, and tool-attempt evidence. `agent-cli` owns terminal/client projection and attach/session utilities only.

The coherent ownership split is that Narada proper owns the Agent Runtime Server package and stable runtime-server entrypoint. `agent-cli` is a terminal/client projection, not a runtime name and not the carrier substrate behind NARS. Codex, Claude Code, Pi, Kimi, and API providers stay replaceable adapters behind the carrier/runtime boundary.

NARS also owns local session discovery for existing runtime sessions. The implementation-facing mechanics live in [`nars-runtime-contract.md`](nars-runtime-contract.md#session-discovery-and-attachment-index): each session has Site-local durable records under `.narada/crew/nars-sessions/<session-id>/`, and NARS maintains a rebuildable discovery index so peer clients such as `agent-cli`, `agent-tui`, and `agent-web-ui` can attach by verified event and health endpoints without inspecting terminal windows or owning runtime state.

## De-Arbitrarization Result

After descent, the remaining decision-relevant freedoms are explicit:

- transport;
- process lifetime;
- event delivery shape;
- provider/model adapter;
- tool substrate;
- concurrency policy.

The required invariant is no longer hidden:

```text
Agent Runtime Server is a durable, addressable Agent Session control surface.
It may host intelligence.
It may mediate local tools.
It does not own operational authority.
```
