# NARS Session Input Contract

Status: implemented contract for governed input to an existing NARS session.

## Decision

Input to an existing NARS session is a governed delivery of addressed intent.
It is not ad hoc prompt injection, a second message bus, or a direct write to
runtime files.

The canonical path is:

```text
bound caller
  -> session-input admission surface
  -> policy and authority fencing
  -> narada.carrier.input_event.v1
  -> carrier.input.deliver
  -> NARS authority runtime
  -> durable session evidence
  -> bounded admission/readback
```

The NARS authority runtime remains the owner of session state, queue state,
turn admission, and provider dispatch. A caller may request delivery, but it
does not become the session authority by sending a message.

## Vocabulary

- **Directive**: first-class addressed intent with source, authority, target,
  content, admission, delivery, and ordering semantics.
- **Input event**: the canonical transport envelope used to deliver an admitted
  directive or other carrier input. Its schema is
  `narada.carrier.input_event.v1`.
- **NARS session**: a concrete carrier session identified by a session id and
  governed by its live authority runtime.
- **Session input surface**: a policy-gated facade that resolves a session,
  validates the request, and submits it through `carrier.input.deliver`.
- **Admission**: the NARS/runtime decision that the input was accepted for the
  requested delivery mode. It is not provider completion.

A prompt is only a carrier-specific rendering of admitted input. It is not the
governed object.

## Authority Ownership

The boundary has distinct owners:

| Boundary | Owner | Responsibility |
| --- | --- | --- |
| Caller intent | Calling agent or operator | Proposes content and target. |
| Delivery policy | Bound MCP/site authority | Checks caller, site, mode, capability, and scope. |
| Session mutation | NARS authority runtime | Owns session state, queue, turn admission, and dispatch. |
| Provider execution | Carrier/provider adapter | Executes the admitted turn and records completion. |
| Reconciliation | Session authority and projections | Records receipt, queue, turn, completion, refusal, or abandonment. |

For cross-site delivery, the User Site or controlling Site may authorize the
route, but the target Site's NARS runtime remains the final mutation locus for
the target session. No two surfaces may independently mutate the same session
state.

## Request Shape

The `@narada2/nars-session-mcp` facade exposes a narrow command:

```text
nars_session_input_deliver({
  site_id,
  session_id,
  content? | directive?,
  delivery: "send" | "enqueue" | "steer",
  idempotency_key,
  expected_authority_epoch?,
  payload_ref?
})
```

The exact MCP schema is implementation-owned, but these constraints are
mandatory:

- `site_id` and the concrete `session_id` are explicit when the binding can
  address more than one site or session.
- The caller does not supply an arbitrary source principal, authority locus,
  capability, or reviewer identity. Those are derived from the bound session
  and checked by policy.
- Agent-originated input is represented as agent-originated input. It must not
  masquerade as operator input.
- Content is either a typed directive or a bounded plain-text directive. Raw
  text does not itself confer execution authority.
- `delivery_mode` is explicit. The surface must not guess whether an input is
  interruptive or durable.
- Large content crosses the payload/output reference boundary rather than
  being silently truncated.

## Delivery Modes

The modes map to existing NARS semantics:

- `send`: deliver to the current/next eligible turn according to NARS rules;
  it is not a durable caller-owned queue.
- `enqueue`: place the input in the NARS-owned queue for a later turn boundary;
  the MCP surface must not create a parallel queue.
- `steer`: explicitly interrupt or redirect according to NARS policy. It must
  never be an implicit fallback for `send` or `enqueue`.

The response acknowledges only the highest state actually observed, for
example `refused`, `admitted`, `queued`, or `admitted_to_turn`. It must not
claim `processed` or provider completion until NARS evidence confirms it.

## Admission Sequence

1. Bind the caller principal and authority context from the MCP/session
   binding.
2. Resolve the requested site and concrete session through the authoritative
   session index and current authority locator.
3. Verify liveness, authority epoch, session state, allowed delivery mode, and
   cross-site scope.
4. Materialize or resolve a typed directive and assign provenance.
5. Normalize it into `narada.carrier.input_event.v1`.
6. Submit it through `carrier.input.deliver`.
7. Return a bounded receipt containing the input/directive id, target session,
   authority epoch, protocol method, admission state, and evidence reference.

If session resolution is stale, ambiguous, closed, revoked, suspended, or
superseded, the request is refused and the refusal is durable. The surface
must not fall back to a cached locator or write directly to a control file.

## Evidence and Recovery

The session authority is the source of truth. Session indexes, health panels,
browser projections, and MCP caches are read models.

The surface must preserve enough evidence to distinguish:

- request constructed;
- directive admitted or refused;
- input event submitted;
- input accepted by NARS;
- input queued or admitted to a turn;
- provider dispatch;
- provider completion;
- abandonment or timeout;
- stale-authority refusal.

Transport timeout is not proof of delivery failure or success. A status/readback
command must inspect the authoritative session evidence and report uncertainty
when the terminal state is not known.

## Boundary With Tasks, Inbox, and Routing

Live session input and durable work are different planes:

- Use this surface for bounded coordination with a known existing session.
- Use directives, inbox, task lifecycle, or delegated-task orchestration when
  work must survive session death, receive review, carry acceptance criteria,
  or be retried independently.
- `operator-routing` may decide a target or package a fallback, but it does
  not own session delivery.
- This surface must not silently turn a live message into a task, inbox item,
  or hidden durable queue.

## Carrier Invariants

Every carrier must preserve the same meaning for the same input event:

1. Source and authority provenance remain distinct.
2. Admission and provider completion remain distinct.
3. `send`, `enqueue`, and `steer` retain their explicit semantics.
4. The same stale or superseded authority is refused consistently.
5. Session state is mutated only by the declared NARS authority runtime.
6. The same input event produces equivalent queue, turn, visibility, and
   completion evidence across carrier embodiments.

This contract extends the shared carrier runtime contract; it does not create
a carrier-specific interpretation of session input.

## Package Ownership

- Narada `carrier-protocol` owns the input event schema, source metadata,
  delivery classification, fixtures, and protocol invariants.
- The `@narada2/nars-session-mcp` surface owns only MCP argument
  validation, site/session resolution, policy checks, and translation to the
  canonical protocol.
- The NARS runtime owns queue storage, control sidebands, session files,
  provider dispatch, and authoritative lifecycle evidence.
- Carrier UIs and launchers own presentation and attachment mechanics only.

The MCP facade must not write `control.jsonl`, create a second queue, invoke a
provider directly, or redefine carrier authority.

## Related Contracts

- `docs/concepts/directive-as-first-class-object.md`
- `docs/concepts/nars-session-management.md`
- `docs/architecture/carrier-runtime-contract.md`
- `packages/carrier-protocol/src/carrier-protocol.mjs`
