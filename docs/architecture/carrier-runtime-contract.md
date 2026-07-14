# Carrier Runtime Contract

This document defines the durable target architecture for Narada carrier/runtime contracts.

## Problem

Narada currently has multiple carrier-facing implementations and surfaces: NARS / `agent-runtime-server`, `agent-cli`, `agent-tui`, and Codex-as-carrier. They should differ in presentation and adapter mechanics, but not in the meaning of a session, command, tool, payload, authority decision, or runtime state.

When those semantics live inside each surface, behavior drifts. One carrier may admit a tool while another hides it; one may serialize a payload ref differently; one may treat a provider or command as available while another rejects it. Those are runtime contract failures, not UI differences.

## Target

Narada should have one shared carrier runtime contract consumed by all admitted carriers and carrier surfaces.

Use [`Carrier Taxonomy`](../concepts/carrier-taxonomy.md) for the vocabulary boundary between `Carrier`, `CarrierKind`, `CarrierHost`, `CarrierTransport`, `CarrierProtocol`, `CarrierRuntimeContract`, `CarrierSurface`, and `ControlChannel`.

The shared contract defines:

1. Carrier protocol and session event schema
2. Input/control JSONL schema
3. Payload refs and reader-tool semantics
4. MCP fabric projection and tool visibility
5. Tool admission and action classification
6. Provider/carrier admission and environment contract
7. Tool-call envelope format
8. Runtime launch, heartbeat, session identity, and carrier paths
9. Transcript/session persistence rules
10. Command vocabulary and command semantic effects
11. Conversation observer visibility and interjection semantics

## Ownership Boundary

Shared packages own runtime meaning and policy.

Carrier surfaces own presentation and transport details.

Carrier hosts own deployment/runtime constraints such as local processes, Cloudflare Workers, Durable Objects, containers, process supervision, and storage bindings. Host posture must not redefine carrier runtime semantics.

`agent-cli` owns line-oriented terminal presentation, stdin/stdout behavior, attach/session utilities, and CLI formatting.

`agent-tui` owns Ratatui layout, panes, composer behavior, keybindings, and visual transcript rendering.

Codex-as-carrier owns Codex-specific process/API adaptation and stream parsing.

No surface should independently define carrier authority, MCP visibility, provider admission, payload ref semantics, command effects, session protocol, or runtime identity.

Conversation observer behavior follows the same boundary: shared contracts define observer source metadata, visibility, admission, and evidence semantics; each carrier owns only its presentation and transport mechanics. See [`Conversation Observer`](../concepts/conversation-observer.md).

## Carrier Input Pipeline

Carrier input handling is a shared semantic pipeline. Carriers may differ in how input arrives and how results are rendered, but they should not redefine the meaning of admission, queueing, observer visibility, or provider dispatch.

The shared pipeline stages are:

1. Control request classification

   `classifyCarrierControlRequest(...)` classifies upstream control requests such as session status, interrupt, conversation send, carrier input delivery, observer status, and observer mute/unmute. This stage answers what kind of control action was requested and whether it may run concurrently or after session close.

2. Input normalization

   Control, legacy, manual, and transport-specific records normalize into `narada.carrier.input_event.v1`. Normalization assigns source kind, source id, transport, delivery mode, hold condition, authority references, directive ids, and observer metadata before later stages reason about the input.

3. Observer classification

   `classifyCarrierObserverInput(...)` classifies observer input visibility and effect. It determines whether the input is an observer observation, whether it is `record_only`, `operator_visible`, `agent_visible`, or `conversation_visible`, whether it is suppressed by mute state, whether it is visible to the Operator, and whether it may be dispatched to the active agent provider context.

4. Directive classification

   `classifyCarrierDirectiveInput(...)` classifies directive input visibility and effect. A directive is first-class addressed intent; prompt text is only one possible delivery artifact. `system` is source/provenance for a directive emitter, not a hidden conversation participant. Directive visibility determines whether an admitted directive is record-only, operator-visible, agent-visible, or conversation-visible.

   Directive production is also governed by the shared carrier directive emitter registry. Registry entries define directive kind, authorized emitter posture, authority basis, trigger kind, cadence when applicable, default visibility, target scope, delivery behavior, and suppression vocabulary. Current registry entries include `operation_heartbeat` as a cadence-triggered, `record_only`, carrier-session directive and `operation_attention` as a runtime-triggered, `operator_visible`, operation-scoped directive.

   The basic cadence test is an `operation_heartbeat` system directive with `visibility: record_only` and a one-minute cadence. It records `directive_receipt_recorded` and `directive_carrier_accepted_recorded`, completes without provider dispatch, and does not create `input_admitted_to_turn`. Runtime-triggered directives such as `operation_attention` use the same registry and input pipeline rather than introducing carrier-specific runtime stimulus categories.

   A runtime that emits a registered directive records `directive_emission_authorized`, then `directive_emission_rule_recorded`, then `directive_emitted` before delivering the generated `narada.carrier.input_event.v1` through `carrier.input.deliver`. These emission events are producer-side evidence; they do not replace carrier receipt or acceptance evidence. Suppressed emission is not carrier receipt: disabled emission, inactive rules, missing targets, and unsupported directive kinds stop before delivery.

   System-originated carrier input is the general pattern. A site loop, scheduler, probe, webhook, sensor, operator policy, or other mechanical observation may produce a directive, but the origin mechanism does not create a new participant or a new carrier semantics category. It produces an authorized directive input event and sends it through the same `carrier.input.deliver` pipeline as every other directive.

   This follows Narada's intelligence-authority separation: the detecting mechanism may classify a condition, but authority is carried by the directive emitter registration, rule evidence, target scope, and input event metadata. It also preserves constructive invariance: the same system-originated directive should mean the same thing in `agent-cli`, `agent-tui`, Cloudflare carrier hosts, or any future carrier host.

   A one-minute heartbeat is only the minimal test case for this pattern. A probe that observes a webhook delay crossing a critical threshold, a scheduler that notices an operation is overdue, or a site loop that detects a stale resident all use the same shape: observe, classify, authorize emission, emit a directive input event, deliver it through the carrier input pipeline, and record carrier receipt/acceptance/completion evidence. Whether the carrier dispatches that directive into provider context depends on directive visibility and admission classification, not on the fact that it came from a system mechanism.

5. Composer hold classification

   `classifyCarrierInputHold(...)` classifies whether a system directive must be held because the carrier composer is active with a non-empty draft. The carrier surface detects composer state; the shared contract determines the `system_directive_held` and `system_directive_released` lifecycle evidence.

6. Input admission

   `classifyCarrierInputAdmission(...)` composes base input admission with observer and directive classification. It decides whether the input creates a provider turn, completes without provider dispatch, emits observer observation/proposal/admission/suppression evidence, emits directive receipt/acceptance evidence, or emits `input_admitted_to_turn`.

7. Queue admission

   `classifyCarrierInputQueueAdmission(...)` adds carrier queue lifecycle evidence. It records the shared rule that `admit_after_active_turn` input emits `input_queued_for_turn_boundary` when it enters the carrier queue, including the idle case where the same input may be admitted immediately on drain.

8. Completion

   Carrier runtimes record `input_completed` with the terminal state produced by the admitted work. Observer inputs that are record-only, operator-visible only, or muted complete without provider dispatch. Record-only and operator-visible directives also complete without provider dispatch. Agent-visible and conversation-visible observer or directive inputs create ordinary provider turns, queueing for the next turn boundary when another turn is active.

Shared packages own the stages above. Carrier surfaces own queue storage, rendering, composer behavior, transport mechanics, and provider adapter execution, but they should consume the shared classifiers instead of copying these decisions locally.

## Tool / Effect Boundary

Provider tool-call output is not effect execution. A carrier records the crossing with shared session events:

1. `provider_tool_call_requested`
2. `tool_call_requested`
3. `tool_result_received`

The shared `tool_result_received` payload distinguishes three outcomes:

- `denied`: the carrier boundary refused the effect, such as an unconfigured adapter, a tool requiring a separate carrier-action admission, an unsupported tool, or missing authority.
- `ok`: the carrier boundary admitted the effect and the effect completed.
- `failed`: the effect did not complete. If the carrier boundary already admitted the effect, this is an admitted execution failure. If the adapter failed before producing an admission decision, the result may omit admission evidence while still preserving the boundary crossing.

When the boundary admits or denies an effect, tool results should include `admission_action` and `admission_reason`. Admitted results should also carry `capability_ref`, `effect_scope`, and `authority_ref` evidence when those concepts apply. A failed admitted effect must remain `status: failed` with `admission_action: admit`; carriers must not collapse it into boundary denial. A failed adapter or boundary execution path with no admission decision may remain `status: failed` without `admission_action` or `admission_reason`.

Shared vocabulary currently includes `read_only_tool_effect_admitted`, `write_tool_effect_admitted`, `tool_effect_adapter_unconfigured`, `tool_effect_admission_required`, `unsupported_tool_effect`, and `tool_effect_authority_denied`. Carrier implementations own substrate mechanics, but they should use shared classifiers, payload constructors, validators, and fixtures for the boundary evidence.

## Contract Invariants

A carrier is compatible only if these invariants hold:

1. The same input/control/session fixture parses to the same semantic event in every carrier.
2. The same MCP fabric configuration exposes the same visible tools in every carrier.
3. The same tool request receives the same admission decision in every carrier.
4. The same payload size/sensitivity decision produces the same inline/ref behavior in every carrier.
5. The same provider/carrier configuration resolves to the same admitted or refused state in every carrier.
6. The same command text resolves to the same command effect in every carrier.
7. The same launch/session identity data produces the same heartbeat and session metadata in every carrier.
8. The same carrier input event produces the same observer visibility, directive visibility, queue lifecycle evidence, turn admission, provider dispatch decision, and completion posture in every carrier.

## Package Shape

Existing shared packages should remain the first home for their domains:

1. `packages/carrier-protocol`
2. `packages/mcp-fabric`
3. `packages/carrier-action-admission`

New packages should be introduced only where the existing package boundary would become confused:

1. `packages/operator-surface-runtime-contract`
2. `packages/carrier-provider-contract`
3. `packages/carrier-command-contract`

The shared packages should expose JSON schemas, golden fixtures, and JS APIs. Rust consumers should use generated or fixture-verified bindings rather than local semantic copies.

## Non-Goals

This is not a plan to make `agent-tui` call `agent-cli`.

This is not a plan to force every carrier to share UI code.

This is not a plan to hide provider-specific adapters. Provider adapters may remain surface-specific where process/API mechanics differ, but their contracts and fixture behavior must be shared.
