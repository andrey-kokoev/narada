# Directive As First-Class Object

## Decision

Narada should treat a **directive** as the first-class semantic object for intent addressed to an agent, carrier, Site, role, task, session, or workspace.

A prompt is not the first-class object. A prompt is one possible rendered delivery artifact derived from an admitted directive for an LLM substrate.

## Vocabulary

- **Directive**: typed intent object with source, authority, target, content, admission, delivery, and ordering semantics. It becomes durable when admitted, refused, delivered, or otherwise crossing a governed boundary.
- **Operator directive**: a directive whose source is the operator.
- **Agent directive**: a directive emitted by one agent toward another locus.
- **System directive**: a directive emitted by daemon, task lifecycle, policy, mailbox intake, scheduler, or another governed subsystem.
- **Prompt rendering**: runtime-specific text produced from one or more admitted directives.
- **Directive admission**: the validation and materialization decision before delivery.
- **Directive delivery**: the concrete transport form, such as prompt rendering, MCP message, task note, launch instruction, or lifecycle mutation request.

## Rationale

`prompt` is too substrate-colored. It names how many LLM runtimes receive text, not what Narada is governing.

The same intent may need to become:

- an LLM prompt fragment,
- a CLI input,
- an MCP tool call,
- a task lifecycle note,
- a launch instruction,
- a policy override request,
- or a refused/admitted event with no immediate runtime delivery.

Calling the durable object a directive keeps authority and routing separate from rendering.

## Shape

```json
{
  "schema": "narada.directive.v1",
  "directive_id": "dir_...",
  "created_at": "2026-05-27T00:00:00.000Z",
  "source": {
    "kind": "operator",
    "id": "operator.andrey",
    "label": "Andrey"
  },
  "authority": {
    "locus": "narada_proper",
    "basis": "interactive_session"
  },
  "target": {
    "kind": "role",
    "id": "builder"
  },
  "content": {
    "kind": "instruction",
    "text": "Investigate mailbox intake and report only verified findings."
  },
  "ordering": {
    "priority": 100,
    "sequence": 0,
    "not_before": null,
    "expires_at": null
  },
  "admission": {
    "status": "pending"
  }
}
```

`source.id` names the concrete emitter identity. `authority.locus` names the authority jurisdiction in which the directive is admitted or refused. They should not be overloaded with the same value merely because a Site is involved.

## Typing

A directive is typed at the object/protocol level. Its content may be weakly typed or strongly typed depending on the boundary it crosses.

Typing should be explicit along three axes:

| Axis | Field | Meaning |
| --- | --- | --- |
| Directive type | `directive.kind` or `content.kind` when no separate field exists | What semantic class of input this is. |
| Target type | `target.kind` | What kind of locus is addressed. |
| Payload type | `content.kind` plus refs | How the payload should be interpreted. |

Examples of directive types:

- `instruction`: general instruction or operator text.
- `attention`: tells an agent to attend to a work item, event, or context.
- `constraint`: limits behavior for a session, task, or locus.
- `policy`: points at an admitted policy/posture rule.
- `handoff`: transfers attention or responsibility between loci.
- `pause`: asks a carrier or agent to stop advancing until a condition changes.
- `escalation`: asks for operator or higher-authority review.

Examples of payload types:

- `plain_text`: human-readable text with no structured executable meaning.
- `task_ref`: pointer to a governed task.
- `work_ref`: pointer to a Site-local work item or admission record.
- `source_ref`: pointer to source evidence such as email/message ids.
- `policy_ref`: pointer to a policy or posture artifact.
- `structured_instruction`: bounded structured payload with a known schema.

Weakly typed content is acceptable for operator instructions, notes, and launch context. Stronger typing is required when the directive is system-emitted, retryable, idempotent, linked to task lifecycle, or intended for automated routing.

Raw text alone must not imply execution authority. A text directive may influence context or attention, but command execution, task mutation, publication, outbound email, or other effects still require their own capability and admission boundaries.

For a Site-scoped system directive, use a Site-local system emitter identity and keep the authority locus separate:

```json
{
  "source": {
    "kind": "system",
    "id": "narada-proper.system.directive_emitter"
  },
  "authority": {
    "locus": "narada_proper",
    "basis": "operator_authorized_system_directive:auth_..."
  }
}
```

This preserves both facts: the operator may authorize the system to emit the directive, while the emitted directive's immediate source remains the Site-scoped system emitter.

The authorization is itself a separate durable record:

```json
{
  "schema": "narada.directive-emission-authorization.v1",
  "authorization_id": "auth_...",
  "authorized_by": {
    "kind": "operator",
    "id": "operator.andrey"
  },
  "authorized_emitter": {
    "kind": "system",
    "id": "narada-proper.system.directive_emitter"
  },
  "authority": {
    "locus": "narada_proper",
    "basis": "operator_requested_system_directive"
  },
  "directive_template": {
    "target": { "kind": "role", "id": "architect" },
    "content": { "kind": "instruction", "text": "Always include active directives in startup context." }
  },
  "status": "authorized"
}
```

The emitted directive should then use `authority.basis = "directive_emission_authorization:auth_..."`.

The preferred MCP surface for this crossing is:

```text
narada_directive_record_operator_authorized_system_emission
```

Its semantics are intentionally narrow: record operator authorization, emit/admit the system directive, and report `executionAttempted: false` plus `deliveryAttempted: false`. It does not execute directive content and does not push the directive into a carrier session by itself.

## Prompt Stack

When a directive is rendered as prompt context, the carrier should assemble the context explicitly:

1. Runtime/system contract.
2. Role and bootstrap material.
3. Admitted directives in deterministic order.
4. Task or work item context.
5. Session continuation context.

This ordering should be recorded so the received runtime context can be reconstructed.

## Admission Rules

- A directive is not automatically a task.
- A directive is not automatically a prompt.
- A directive is not automatically executable authority.
- Delivery requires admission by the relevant Site/runtime boundary.
- Refusals should be durable when the directive crosses a governed boundary.
- Operator-authorized system emission should produce `directive.emission_authorized` before `directive.created` and `directive.admitted`.

## Relationship To Adjacent Concepts

This concept is coherent only if directive does not replace existing Narada intake and admission concepts.

| Existing concept | Relationship |
| --- | --- |
| Intent Candidate | Interpretation output. It is inert pressure before admission. A directive may be the admitted form of a candidate when the chosen path is instruction, constraint, routing, or delivery. |
| Canonical Inbox Envelope | Intake artifact for arrivals. An envelope may contain or produce a directive, but inbox submission remains inert and does not deliver the directive by itself. |
| Task Candidate | Proposed durable work. If admitted into task lifecycle, it becomes a task rather than a directive. |
| Task | Governed work item with lifecycle, assignment, evidence, review, and closure semantics. |
| Carrier Session | Runtime embodiment that may consume rendered directives, but does not own directive authority. |
| Prompt | Substrate-specific rendering of admitted directives plus role/bootstrap/task/session context. |
| Command Execution Intent | A directive may request command execution, but execution still crosses CEIZ and capability admission. |

Directive therefore sits between interpreted intent and concrete delivery. It names an addressable instruction/constraint/routing object, not a general replacement for inbox, task lifecycle, or command intent zones.

## Carrier Implications

Agent carriers should consume admitted directives rather than ad hoc prompt strings.

For NARS-backed local sessions, this means the session startup path can eventually read admitted directives and render them into the active conversation context; `agent-cli` may be the attached operator surface, but it is not the directive authority.

For Codex, Kimi, Pi, Claude Code, and other substrates, each carrier may render the same directive differently while preserving the same directive provenance.

## Task Lifecycle Relationship

Task creation is one possible outcome of directive admission, not the default outcome.

Examples:

- A directive to "work on task 12" should usually be delivered into an existing session or assignment flow.
- A directive that identifies new durable work may be admitted into task lifecycle.
- A directive that requests unsafe mutation may be refused and recorded without creating a task.

## Directive Versus Task

A directive is **addressed intent**. A task is **governed work**.

They differ by semantic commitment:

| Dimension | Directive | Task |
| --- | --- | --- |
| Core meaning | Intent to influence a locus | Unit of work accepted into lifecycle |
| Typical source | Operator, agent, daemon, policy, scheduler, mailbox intake | Task lifecycle admission path |
| Target | Site, role, agent, runtime, task, session, workspace, or subsystem | Work queue and accountable agent/role |
| Duration | May be transient or durable | Durable until closed, deferred, superseded, or otherwise disposed |
| Authority | Carries asserted source authority; still requires admission for delivery | Already admitted into task lifecycle authority |
| Delivery | Prompt rendering, MCP message, task note, launch instruction, refusal, etc. | Claim, execute, report, review, close |
| Success condition | May be delivered, refused, acknowledged, rendered, or transformed | Acceptance criteria satisfied and lifecycle closed |
| Ordering | Competes in context/session/directive ordering | Competes in work prioritization and assignment |
| Audit concern | Who asserted what intent toward which locus and how it was delivered | Who owned work, what changed, what evidence closed it |

A directive can produce a task when the system determines that the intent implies durable accountable work. A task can also produce directives when execution requires instructions to agents, carriers, or subsystems.

The boundary is:

- If the object primarily says **what should be communicated, constrained, routed, or rendered**, it is a directive.
- If the object primarily says **what work must be completed and evidenced**, it is a task.

Examples:

- "Launch all Revolution builders with this startup instruction" is a directive.
- "Fix Revolution mailbox intake bridge and verify task materialization" is a task.
- "Do not use native shell for this session" is a directive, possibly policy-like.
- "Investigate whether native shell should be disabled by default" is a task.
- "Tell the resident agent to watch for new mail" is a directive.
- "Implement resident-agent mailbox watch behavior" is a task.

## System Directives As Agent Driver Inputs

System directives constitute Narada's driver input to resident agents, but they are not the whole driver.

A system directive is the durable command/message by which a Site runtime can tell an admitted resident agent to attend to work, refresh context, process an email, run startup, pause, escalate, or observe policy. The driver runtime is the surrounding machinery that selects targets, detects active carriers, leases delivery, retries, records receipt, links to task lifecycle, and records outcome.

This follows from responsibility, not naming preference:

| Concept | Meaning |
| --- | --- |
| System directive | Owns the message/command being addressed. |
| Directive dispatcher | Owns delivery attempts, leases, retry/backoff, and receipt collection. |
| Resident agent carrier | Owns whether a live session can receive a directive after launch. |
| Task lifecycle | Owns accountable work state, assignment, evidence, review, and closure. |

The split is required because each object answers a different question:

- Directive: what was said, by whom, under what authority, to which target?
- Dispatcher: was it deliverable, attempted, leased, received, or expired?
- Carrier: is there a runtime surface that can accept it now?
- Task: what work is accountable and how is it completed?

Agent availability is not an admission condition. If the target agent is not available, the directive remains pending or waiting for agent/carrier availability. It must not be marked delivered until a carrier-specific receipt is recorded.

For email-driven resident work, the sequence is:

1. Mailbox sync materializes the email/event.
2. Intake admits or links a task/work item when durable accountable work exists.
3. Site system emits a directive targeted to the resident agent/role and referencing the task/email evidence.
4. Dispatcher delivers only when an admitted resident carrier is active.
5. Carrier records receipt separately from task completion.
6. Task lifecycle records work outcome; directive lifecycle records delivery/receipt outcome.

This keeps directives from becoming shadow tasks and keeps tasks from becoming ad hoc prompts.

## Work-Admission Trigger

Resident-agent directives should be emitted from work admission or work-state transition, not from raw source arrival.

Raw source arrival is too early. An email, webhook, or message may be ignored, deduplicated, filtered by admission policy, used only as context, or merged into an existing thread. Emitting a directive at that point would turn source noise into agent pressure.

The trigger is justified only when the Site has admitted or changed accountable work:

| Trigger | Directive behavior |
| --- | --- |
| New task/work item admitted for resident handling. | Emit one resident attention directive. |
| Existing task/work item reopened or materially updated. | Emit or update one resident attention directive for the new transition. |
| Source fact ignored by admission policy. | Do not emit a directive. |
| Source fact synced only as context, such as sent mail. | Do not emit a directive unless it changes admitted work state. |
| Duplicate sync of already-admitted work. | Do not emit another directive; preserve idempotency. |

The idempotency key should be derived from Site id, work/task id, directive purpose, target, and the work-state transition that caused the directive. It should not be derived only from the raw email/message id, because one thread or task may contain multiple source facts while still needing only one resident instruction.

An emitted resident directive should include:

- source: Site-local system directive emitter,
- authority: Site authority locus and admission/transition basis,
- target: resident agent or resident role,
- content: bounded instruction to attend to the admitted work,
- source refs: email/message/context ids that support the work,
- work refs: task/work item id and transition id,
- delivery state: initially pending, not delivered.

Creating this directive does not execute work, deliver a message to a carrier, claim a task, or mark the work processed. It only records that the Site runtime has driver input for a resident agent when delivery becomes possible.

## First Implementation Slice

The first implementation should stop before live carrier push unless the queue and receipts already exist.

Required first slice:

1. Add Site-local directive tables or an attached Site-local directive database.
2. Record resident directives from task/work admission transitions with idempotency.
3. List pending directives for a target agent/role.
4. Record delivery attempt state without pretending receipt.
5. Expose a read surface for resident startup/polling.
6. Record carrier receipt separately when NARS accepts a directive into its turn queue.

Explicitly deferred:

- automatic carrier push that bypasses the admitted carrier control transport,
- active window focus or terminal text injection,
- task claiming by directive creation,
- marking delivered without carrier receipt,
- direct command execution from directive content.

The first live carrier integration should be pull-based or receipt-gated: NARS asks for pending admitted directives at startup or interval, receives them through its controlled conversation loop, and records receipt. Push can be added later only if it preserves the same lease and receipt semantics.

The current admitted live transports are:

| Carrier | Operator text transport | Programmatic directive transport | Receipt evidence |
| --- | --- | --- | --- |
| NARS / `agent-runtime-server` | attached operator surfaces such as `agent-cli` | launcher-registered Site-local `control.jsonl` sideband or JSONL stdio method `system_directive.deliver` | session event `directive_receipt_recorded` with `narada.directive.carrier_receipt_evidence.v1` |

`control.jsonl` is not a global queue. It is a launcher-registered control path for one carrier session under that Site's `.narada\crew\nars-sessions\<carrier_session_id>\` directory. It preserves provenance separation between operator input and system/programmatic directive delivery while avoiding terminal text injection.

## Startup Triage

When an agent starts and receives many active admitted directives, it must not execute them blindly or treat arrival order as authority.

The startup behavior is a triage pass:

1. Pull or render active admitted directives for the agent identity, role, carrier, session, Site, workspace, and relevant task targets.
2. Order directives deterministically by admission state, priority, sequence, creation time, and target specificity.
3. Record carrier receipt for the directives that were actually delivered to the session context.
4. Classify each directive before acting:
   - context or constraint,
   - attention/work pointer,
   - policy or safety guard,
   - stale or superseded,
   - conflicting,
   - unclear or unsafe.
5. Resolve next work through governed task lifecycle or the relevant domain surface, not by simply executing the first directive.
6. Record refusal, ignored/superseded posture, or follow-up need when a directive cannot be safely honored.

Directive receipt, directive acceptance, directive refusal, and task completion are separate states.

This preserves Narada's telos:

- no ambient authority,
- no hidden prompt stuffing,
- no execution by text alone,
- explicit source and authority,
- visible conflict/staleness handling,
- work truth remains in task lifecycle,
- delivery truth remains in carrier receipt.

Directives are governed attention/context inputs. They are not an imperative job queue for an LLM runtime.

## Storage Locus

There should be no global Narada directive database.

Directive doctrine, schemas, and invariants live in Narada proper. Directive instances live in the target Site's runtime state.

The storage locus is determined by these rules:

| Rule | Consequence |
| --- | --- |
| Authority locus owns admission. | A directive admitted for a Site is stored in that Site's runtime state. |
| Runtime delivery is Site-local. | Delivery attempts, leases, and carrier receipts are stored next to the Site runtime that can observe carriers. |
| Work linkage needs transactional joins. | Work-related directives should live in the same SQLite authority surface as task lifecycle or in an attached Site-local SQLite database with explicit foreign/source refs. |
| Doctrine must be portable. | Schemas and invariants live in Narada proper docs/code, not in one Site's queue. |
| Cross-Site state is not ambient authority. | Another Site may read exported evidence, but must not mutate or depend on a global directive queue. |

For SQLite-backed Sites, the default is therefore: store directive instances in the Site's SQLite authority surface adjacent to task lifecycle when the directive is work-related. Use a separate Site-local directive database only when task lifecycle schema ownership or migration cadence would otherwise become muddled.

This is not a general preference for SQLite. It is selected when directives need queue semantics: idempotency, leases, retry state, carrier receipts, source refs, and joins to work/email evidence. File-backed directive stores remain acceptable for low-volume doctrine, launch context, or operator/session directives that do not require queue behavior.

Site-local directive storage should support:

- durable directive records,
- source references such as email/message/task ids,
- target records for agent/role/site/workspace/session,
- delivery attempts and leases,
- carrier receipts,
- processing/outcome records,
- idempotency by source evidence.

Authored docs/config remain Git-visible doctrine and posture. Runtime directive queues, leases, receipts, and outcomes remain Site-local operational state.

## Residual Requirements

| Gap | Closure state | Closure rule |
| --- | --- | --- |
| Directive state machines | Doctrine-closed; model support required. | Admission, delivery lease, receipt, triage, refusal, and task completion are separate states/records. |
| Authority vocabulary | Doctrine-closed; runtime vocabularies remain Site-specific. | Source asserts, authority basis explains, authority locus admits, target does not grant effects. |
| Site-local enforcement | Doctrine-closed; Site runtime guards required. | Target Site refuses mismatched authority locus and non-admitted carriers. |
| Typed directive validation | Doctrine-closed; model/runtime validators required. | System attention directives require strong refs such as task/work refs; raw text never grants effect authority. |
| Anti-smearing event order | Doctrine-closed; event writer required. | Authorization precedes directive creation/admission; delivery lease precedes carrier receipt; task effect crosses task lifecycle separately. |
| Storage locus | Closed. | No global directive DB; instances live in target Site runtime state. |
| Agent startup behavior | Doctrine-closed; carrier implementation required. | Agent performs deterministic startup triage instead of executing directive order blindly. |
| Post-work-admission emission | Doctrine-closed; runtime implementation required. | Emit resident attention directives from admitted/changed work, not raw source arrival. |
| Carrier receipt evidence | First carrier slice closed for NARS / `agent-runtime-server`. | Receipt is recorded when the carrier runtime accepts a directive into its turn queue, separate from work completion. |
| Live carrier push | Not admitted yet. | Add only after directive queue, delivery lease, and carrier receipt are implemented. |

Implementation task list:

1. Add model-level directive kind, typed refs, delivery lease, receipt, triage, and validation helpers.
2. Add Site-local directive persistence for SQLite-backed queues.
3. Add post-work-admission resident directive emission with idempotency by Site, task/work id, transition id, purpose, and target.
4. Add pending directive read surface for resident startup/polling.
5. Add carrier receipt writing from NARS / `agent-runtime-server`.
6. Add runtime guards for authority locus and admitted carrier kind.
7. Add export/import posture for Site-local directive evidence.
8. Add retention/TTL policy for short-lived directives.

The current doctrine closes the semantic shape. Runtime closure requires implementing the task list in order; live push remains explicitly out of scope until queue leasing, registered carrier control transport, and receipt recording are all present for the target Site.
