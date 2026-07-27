# Narada Target Architecture

## Status and authority

**Status:** normative destination; this document describes the intended end state, not a claim that the repository already satisfies it.

This document owns the cross-cutting composition of Narada's authority, intelligence, runtime, embodiment, projection, and operator-surface contracts. It does not replace the narrower contracts linked below.

- [`system.md`](../concepts/system.md) owns the general zone-and-crossing model and the principle that intelligence proposes while authority decides.
- [`nars-runtime-contract.md`](../concepts/nars-runtime-contract.md) owns the implementation-facing NARS runtime, protocol, lifecycle, and package boundaries.
- [`narada-runtime-projection-graph.md`](../concepts/narada-runtime-projection-graph.md) owns the general authority-to-projection topology.
- [`nars-client-projection-contract.md`](../concepts/nars-client-projection-contract.md) owns shared event and operator projection semantics.
- [`nars-authority-runtime-host-transition.md`](../concepts/nars-authority-runtime-host-transition.md) owns governed local/remote authority-host transitions.
- [`first-class-narada-runtime-concepts.md`](../concepts/first-class-narada-runtime-concepts.md) owns current concept-promotion and implementation status.
- [`concept-registry.md`](../concepts/concept-registry.md) owns semantic concept identity, ownership, relations, and promotion evidence.

The target architecture is reached by satisfying the invariants here and the detailed acceptance criteria in those contracts. A package migration, typecheck, or passing unit test is evidence toward the destination, not the destination itself.

## Destination

Narada is a governed, evidence-producing runtime for a Site.

Each authority zone has an explicit owner. Intelligence evaluates and proposes. Authority admits decisions and effects. Execution produces durable evidence. Observation confirms what happened. Human, local, remote, and machine surfaces consume governed projections and submit intents through explicit routes.

The destination preserves this separation:

~~~text
evaluation -> decision -> intent -> execution -> confirmation
~~~

The system must make it possible to answer, for every consequential action:

~~~text
who requested it,
which Site and authority epoch admitted it,
which intelligence plan informed it,
which capability executed it,
what effect was attempted,
what observation confirmed or failed to confirm it,
and which projections now expose that evidence.
~~~

## What the destination is not

Narada is not:

- an autonomous agent framework in which model output owns permission or truth;
- a message bus, cache, mirror, or connectivity layer whose copies are treated as canonical;
- a substrate-first architecture defined by SQLite, Cloudflare, Vue, TypeScript, or a particular provider;
- a collection of independent client interpretations of one runtime stream;
- a set of provider-specific environment variables that secretly determine runtime intelligence;
- a topology with multiple uncoordinated canonical writers for one Site/runtime scope.

Substrates and frameworks are embodiments. Authority, evidence, and governed crossings are the architecture.

## Canonical authority model

An authority boundary is defined by the facts and transitions a component may authoritatively create, not by its process, package, host, or user interface.

| Object or boundary | Canonical owner | Explicit non-owner |
| --- | --- | --- |
| Site facts, Site policy, effect admission, and external-effect authority | Site authority zones | Intelligence, projections, carriers, and caches |
| One NARS session's identity, lifecycle, input admission, turn state, event identity, replay, health, and recovery | NARS session core/runtime authority | Browser components, terminal windows, provider telemetry, and ambient process state |
| Intelligence selection and effective invocation plan | Catalog/policy resolver and invokable-intelligence contract | Launcher environment, UI-local option lists, or provider naming conventions |
| Provider/model execution | Inference-provider, model-provider, offering, endpoint, and adapter boundaries | Site permission, session truth, or effect confirmation |
| MCP/tool capability hosting and execution lifecycle | Capability gateway and admitted authority surfaces | Provider convenience code or client rendering |
| Durable effect execution | Explicit worker/effect authority | Model output, carrier adapters, and read-only projections |
| External-effect confirmation | Observation/reconciliation authority | The fact that a request was sent or a provider claimed success |
| Event and client projection semantics | Shared projection contracts | Individual Vue, TUI, CLI, or Cloudflare classifiers |
| Human and machine interaction | Projection surface plus explicit intent route | Runtime authority hidden inside the surface |

NARS is therefore a canonical authority for agent-session/runtime state, but not a universal authority for Site truth or external effects. The distinction is load-bearing.

## Canonical topology

The target topology is:

~~~text
Site or operator input
  -> admission boundary
  -> NARS session and turn authority
  -> invokable-intelligence request
  -> resolved intelligence plan
  -> provider/model adapter
  -> evaluation or capability request
  -> Site/capability authority admission
  -> durable intent
  -> worker/effect execution
  -> external observation and confirmation
  -> canonical Site facts and NARS lifecycle evidence
  -> governed projection edge
  -> projection store
  -> operator or machine surface

operator or machine surface
  -> explicit intent route
  -> owning authority boundary
~~~

The two canonical evidence domains remain distinguishable:

- The NARS journal is authoritative for session, turn, input, provider-lifecycle, capability-lifecycle, health, replay, and recovery evidence.
- Site fact and effect stores are authoritative for Site facts, policy decisions, durable intents, external effects, and confirmation evidence.

They may be projected together for an operator, but a projection must not silently turn one domain's evidence into the other's authority.

## Intelligence as a first-class invocation contract

Intelligence is selected at invocation time. Launching or attaching a runtime establishes identity, Site, session, authority, and capability context; it does not permanently choose a provider/model pair.

The target has two related objects:

- An invocation request: principal, Site/session scope, purpose, context, requested intelligence constraints, and requested capabilities/options.
- An invocation plan: the resolved, lineage-bearing execution plan that records the effective intelligence topology.

An invocation plan must be able to identify, as applicable:

~~~text
model
model_provider
model_offering
inference_provider
inference_endpoint
adapter
credential_locator
effective options
effective capabilities
resolver/catalog revision
validity or epoch
~~~

These are related but non-interchangeable identities. An inference provider is not a model provider; a model is not a credential; an endpoint is not an offering; a UI label is not an authority reference.

Defaults are catalog/policy records in the relevant authority substrate. Local and remote implementations may use different storage substrates, such as Node SQLite and D1, while preserving the same contract. Environment variables may bootstrap a substrate or locate a secret; they must not be the hidden authority for the default intelligence selection.

Capabilities are resolved by explicit scope and compatibility rules. A surface must not construct an invalid state by intersecting unrelated provider, model, and thinking-level option lists. A provider/model change is a state transition that invalidates incompatible dependent selections and produces explicit request, cancellation, acceptance, rejection, or application evidence.

## Authority, embodiment, and host transitions

Local NARS, a Cloudflare-hosted NARS runtime, and future hosts are embodiments of runtime roles. They are not automatically separate authorities.

For a given Site/runtime scope:

- there is one canonical authority owner for the active epoch;
- an authority host transition is explicit, durable, and epoch-bound;
- the outgoing authority is sealed or otherwise prevented from admitting competing writes before the incoming authority becomes canonical;
- replay and handoff evidence identify the boundary between epochs;
- a projection, cache, or transport reconnect never mints a local authority event;
- a host name, process id, port, or browser window does not define identity by itself.

Operator surfaces attach to the authority runtime. They do not launch, supervise, or become the session authority merely because they render a session.

Carriers and provider adapters are execution boundaries. They may translate or run work, but they do not own the NARS journal, Site facts, policy decisions, or confirmation truth.

## Projection architecture

The projection graph is the only permitted route from canonical authority state to a surface:

~~~text
authority runtime
  -> governed projection edge
  -> projection store or bounded transport
  -> projection surface
~~~

A surface may submit an intent only through an explicit route:

~~~text
surface action
  -> typed client/protocol command
  -> authority admission
  -> durable result or refusal
~~~

Agent Web UI, agent TUI, agent CLI, Operator Console, and Cloudflare projection surfaces may differ in layout and transport. They must agree on:

- identity and authority meaning;
- event class and canonical conversation rules;
- lifecycle and degraded/error state meaning;
- command vocabulary and admission boundary;
- capability visibility;
- replay, cursor, and reconnect semantics;
- whether an action is local projection behavior or an admitted runtime intent.

The client projection contract owns shared semantics. Each surface owns only its medium-specific rendering, input ergonomics, and local preferences.

## Evidence and lifecycle requirements

Every accepted request and consequential transition must have bounded, correlated evidence. Correlation must be possible across the relevant request, input event, turn, session, authority epoch, capability operation, intent, effect, and observation identifiers.

The target system distinguishes at least these outcomes:

- accepted and running;
- completed;
- rejected before side effect;
- failed with known failure;
- cancelled;
- interrupted with outcome unknown;
- stale or unavailable authority;
- reconnecting transport with authority still healthy;
- degraded runtime with explicit cause and recovery hint.

No surface may infer completion from silence, a closed transport, a provider telemetry event, a transient health sample, or the absence of a later error. If a mutation outcome is unknown, the system preserves that uncertainty and provides reconciliation rather than inventing success or failure.

## Canonical operator journey

The destination is observable through one coherent operator journey:

~~~text
discover Site/session
  -> attach to the canonical authority
  -> observe truthful identity, host, health, epoch, and capabilities
  -> choose a valid intelligence request
  -> request configuration change and receive explicit admission/application evidence
  -> submit operator input
  -> receive input admission and turn lifecycle evidence
  -> observe canonical conversation, operations, diagnostics, and raw records through shared projections
  -> inspect capability requests, decisions, effects, and confirmations
  -> recover, replay, or reconcile after interruption
  -> detach and reattach without losing authority or semantic continuity
~~~

The journey must remain truthful when a transport reconnects, an agent turn reaches a limit, an MCP child fails, a model/provider changes, or authority moves between hosts.

## Destination invariants

The architecture is coherent only when all of these hold:

- Every authority-bearing object has one named owner and a documented non-owner boundary.
- Every cross-zone crossing has an explicit input, output, authority, confirmation, and provenance rule.
- Intelligence can propose but cannot silently grant permission, create durable effects, or confirm its own effects.
- Runtime selection is represented by a validated invocation plan rather than ambient configuration or UI coincidence.
- One runtime event has one canonical meaning; surfaces project it rather than reclassifying it independently.
- Durable evidence survives transport loss, process restart, replay, and surface replacement.
- Local and remote embodiments preserve the same semantic contracts even when their substrates differ.
- Invalid dependent configuration cannot be submitted as a valid runtime state.
- Refusals happen before unauthorized side effects, and known failures are not disguised as transient degradation.
- New concepts, capabilities, commands, and surfaces are registered with their owner, contract, embodiment, and acceptance evidence.

Strict TypeScript, removal of legacy modules, package factoring, and UI refactoring are implementation controls that support these invariants. They are not sufficient evidence by themselves.

## Conformance and completion

This destination is considered implemented for a slice only when the slice has:

- a named concept and authority owner;
- a stable contract or schema;
- an implementation that respects the ownership boundary;
- projection behavior that consumes the shared contract;
- refusal and failure semantics;
- focused unit/contract coverage;
- a real boundary or live E2E proof where the behavior crosses a process, transport, host, or operator surface;
- documented reconciliation behavior after interruption.

Cross-cutting completion requires parity across local NARS, the relevant remote embodiment, agent CLI/TUI/Web UI, and operator-console surfaces where those surfaces claim the capability.

The implementation ledger, task graph, and current-readiness documents remain the source of progress status. This document remains stable unless the target architecture itself changes.

## Change rule

When a new recurring shape appears:

- promote it through the Concept Registry if it crosses boundaries or repeatedly causes ambiguity;
- assign one authority owner and explicit anti-ownership boundaries;
- add or update the relevant contract before duplicating the shape in clients;
- add projection and refusal semantics before exposing it in an operator surface;
- record implementation and acceptance evidence in the appropriate ledger or task;
- update this document only when the cross-cutting destination or invariant changes.

This keeps the destination stable while allowing implementations, substrates, and package layouts to evolve beneath it.
