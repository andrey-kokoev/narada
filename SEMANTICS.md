# Narada Semantics and Ontology

> **Canonical vocabulary for Narada.**  
> This document is the single source of truth for user-facing and system-facing terms.  
> Other documents may elaborate or contextualize, but they must not contradict these definitions.

---

## 1. User-Facing Vocabulary

Terms that appear in CLI output, configuration, documentation, and user communication.

<a name="operation"></a>
### 1.1 `operation` (Primary)

An **operation** is the live configured thing a user sets up and runs.

- A mailbox operation (syncing `help@company.com`)
- A workflow operation (a timer-driven health check)
- A webhook operation (an inbound HTTP-triggered automation)
- A helpdesk operation (a single mailbox with a triage charter)

Users create, configure, preflight, activate, and run **operations**.

Each operation maps to exactly one `scope`. An operation is the atomic unit of user intent; a scope is its internal representation. If Narada later needs to group or coordinate multiple operations, that will be introduced as a distinct composite concept (e.g. `suite` or `campaign`), not by redefining `operation`.

<a name="ops-repo"></a>
### 1.2 `ops repo`

An **ops repo** (or **operations repo**) is a private repository that contains one or more operations, plus their knowledge, scenarios, and local configuration.

Created with:

```bash
narada init-repo ~/src/my-ops
```

<a name="typed-variants"></a>
### 1.3 Typed Variants

When specificity matters:

| Variant | Meaning |
|---------|---------|
| `mailbox operation` | An operation whose source is a mailbox |
| `workflow operation` | An operation whose source is a timer/cron schedule |
| `webhook operation` | An operation whose source is an inbound HTTP webhook |
| `filesystem operation` | An operation whose source is a local filesystem path |

---

## 2. System Ontology

Terms used inside the kernel, control plane, and runtime.

### 2.1 The Nine-Layer Pipeline

All verticals traverse the same pipeline:

```
Source → Fact → Context → Work → Policy → Intent → Execution → Confirmation → Observation
```

| Layer | Responsibility | Durable? | Canonical Name |
|-------|----------------|----------|----------------|
| **Source** | Pulls records from a remote or local origin using an opaque checkpoint | Checkpoint only | `source_id` |
| **Fact** | Canonical, replay-stable envelope of every observed change | **Yes** | `fact_id` |
| **Context** | Groups facts into policy-relevant scopes | Metadata: **Yes**; grouping: No | `context_id`, `scope_id` |
| **Work** | Terminal schedulable unit opened for a context revision | **Yes** | `work_item_id` |
| **Policy** | Admits, supersedes, or rejects work; governs proposed effects | Decision: **Yes** | `decision_id` |
| **Intent** | Universal durable effect boundary | **Yes** | `intent_id` |
| **Execution** | Claims intent and performs the effect | **Yes** | `execution_id` |
| **Confirmation** | Binds execution outcome back to durable state | **Yes** | — |
| **Observation** | Read-only derived views over durable state | No | — |

### 2.2 Core Abstractions

#### `scope`

The internal runtime/config representation of an operation.

- `scope_id` identifies it in config files and the database
- `scope` is the correct word inside the kernel, CLI code, and config schema
- Users should not need to know the word "scope" to use Narada successfully

Narada compiles one **operation** into one **scope** and then into lower-level runtime/control-plane objects.

#### `fact`

The **first canonical durable boundary**. All external change enters as a Fact.

```typescript
interface Fact {
  fact_id: string;           // deterministic, replay-stable
  fact_type: FactType;       // e.g. "mail.message.discovered", "timer.tick"
  provenance: FactProvenance;
  payload_json: string;      // opaque, vertical-specific
  created_at: string;
}
```

Properties:
- All replay determinism derives from fact identity
- Fact store ingestion is idempotent (`fact_id` primary key)
- Re-pulling may return overlapping records; deduplication is the kernel's responsibility

#### `context`

A policy-relevant grouping of facts.

- `context_id` is domain-neutral. For mailbox it may be a conversation; for timer it may be `timer:{schedule_id}`; for webhook it may be `webhook:{endpoint_id}`.
- `context_records` is the durable table that tracks context metadata (primary charter, status, last activity times).
- `context_revisions` tracks deterministic snapshots of a context over time.
- Work items are keyed by `context_id`, but the abstract *grouping* itself is not durable; only its control-plane metadata and revision history are.
- No kernel section may assume `conversation_id`, `thread_id`, or message semantics.

#### `work_item`

The **terminal schedulable unit**.

```typescript
interface WorkItem {
  work_item_id: string;
  context_id: string;
  scope_id: string;
  status: "opened" | "leased" | "executing" | "resolved" | "failed_retryable" | "failed_terminal" | "superseded" | "cancelled";
  opened_for_revision_id: string;
}
```

Properties:
- At most one non-terminal work item per context may be `leased` or `executing`
- Supersession replaces stale work with new work when a higher revision arrives
- Work items are durable and survive crashes

#### `policy` / `foreman`

The foreman performs three authorities:

1. **Admission** — `onFactsAdmitted()` opens/supersedes work items from `PolicyContext[]`
2. **Governance** — `resolveWorkItem()` validates charter output, applies policy, and decides accept / reject / escalate / no-op
3. **Handoff** — On acceptance, atomically persists the decision and emits an `Intent`

Policy is the **sole gate to effects**. No effect may materialize without passing through foreman governance.

#### `intent`

The **universal durable effect boundary**.

```typescript
interface Intent {
  intent_id: string;
  intent_type: string;        // e.g. "mail.send_reply", "process.run"
  executor_family: string;    // e.g. "mail", "process"
  payload_json: string;
  idempotency_key: string;    // deterministic per (context, action, payload)
  status: IntentStatus;
  context_id: string;
}
```

Properties:
- All side effects (mail sends, process spawns, future automations) must be represented as an Intent before execution
- Idempotency is enforced at `idempotency_key`
- No `Intent` may be created outside the foreman's atomic handoff transaction

#### `execution`

Executors claim admitted Intents and perform effects:

- **Mail family** → `OutboundHandoff` creates `OutboundCommand`, workers mutate Graph state
- **Process family** → `ProcessExecutor` spawns a subprocess, records exit code
- Future families follow the same lifecycle algebra (`admitted → started → completed / failed`)

#### `confirmation`

Binds the external effect back to durable state:

- `submitted` — executor received external acceptance
- `confirmed` — inbound observation or reconciliation proves the effect took hold
- `failed` — external rejection or timeout

Confirmation status is **derived from durable store state**, not in-memory or log state.

#### `observation`

Read-only, reconstructible views over durable state.

- Non-authoritative: may be deleted and rebuilt without affecting correctness
- No scheduler, lease, executor, or sync path may depend on observation artifacts
- Operator visibility must not require terminal attachment

### 2.3 First-Class Runtime Terms

Terms already treated as first-class in code and docs.

#### `charter`

A named policy configuration that defines how a context should be analyzed and what actions may be proposed.

- **Layer**: Control plane / charters domain
- **User-facing**: Yes — users declare `primary_charter` and `secondary_charters` in scope config
- **Durable boundary**: Config-scoped; charter outputs persisted in `evaluations`
- **Authority owner**: Charter runtime (`@narada2/charters`)

Replaces the generic term `agent`. Each scope binds one primary charter and optional secondary charters for arbitration.

#### `posture`

A named safety preset that maps to a concrete set of allowed actions for a vertical.

- **Layer**: ops-kit / CLI
- **User-facing**: Yes — set via `want-posture` or `--posture` flags
- **Durable boundary**: Scope config (`allowed_actions` derived from posture)
- **Authority owner**: Operator

Canonical progression: `observe-only` → `draft-only` → `review-required` → `autonomous`. Postures do not invent actions; they select from the existing `AllowedAction` universe.

#### `evaluation`

The structured output envelope produced by charter execution.

- **Layer**: Control plane / foreman
- **User-facing**: No
- **Durable boundary**: `evaluations` table
- **Authority owner**: Charter runtime (produces); Foreman (governs)

Contains proposed actions, tool requests, confidence scores, and outcome classification. Evaluations are governed by the foreman before any effect is authorized.

#### `decision`

The authoritative record of the foreman's governance outcome for a work item.

- **Layer**: Control plane / foreman
- **User-facing**: No (surfaced read-only via observation)
- **Durable boundary**: `foreman_decisions` table (coordinator store)
- **Authority owner**: Foreman

Binds an approved action, its payload, and rationale. Decisions are the sole gate to intent creation; no intent may exist without a preceding decision.

#### `outbound handoff`

The durable bridge between a foreman decision and its executable command envelope.

- **Layer**: Control plane / outbound
- **User-facing**: No
- **Durable boundary**: `outbound_handoffs` table
- **Authority owner**: Foreman handoff logic

Preserves the decision-to-command lineage and tracks submission status through the outbound worker registry.

#### `outbound command`

The executable command envelope derived from a decision.

- **Layer**: Control plane / outbound
- **User-facing**: No
- **Durable boundary**: `outbound_commands` view/table (outbound store)
- **Creation authority**: `OutboundHandoff.createCommandFromDecision()` (called within the foreman's atomic decision transaction)
- **Mutation/execution authority**: outbound workers registered in `WorkerRegistry` (`send_reply`, `non_send_actions`)
- **Reconciliation authority**: `OutboundReconciler`

Contains the concrete action payload (e.g., draft content, move target) and tracks execution state from creation through confirmation.

#### `tool call`

A governed, durable record of a charter's request to invoke an external tool.

- **Layer**: Control plane / coordinator
- **User-facing**: No (operators may inspect summaries)
- **Durable boundary**: `tool_call_records` table
- **Authority owner**: Charter runtime (requests); Foreman (governs); Executor (performs)

Validated by the foreman before execution. Exit status is recorded for observability and operator categorization.

#### `trace`

A durable record of charter execution metadata.

- **Layer**: Control plane / agent observability
- **User-facing**: No (operator-facing via observation API)
- **Durable boundary**: `agent_traces` table
- **Authority owner**: Charter runtime (produces); Observation layer (reads)

Contains token usage, latency, model references, and session linkage. Non-authoritative for control but essential for debugging and audit.

#### `knowledge source`

A declared reference to external knowledge consumed by a charter during context analysis.

- **Layer**: Charters domain
- **User-facing**: Yes (declared in charter config)
- **Durable boundary**: Config-scoped; normalized items may be cached
- **Authority owner**: Charter runtime

May be a URL, local filesystem path, or SQLite database. Knowledge sources are vertical-specific and bound to charter scope.

#### `operator action`

A durable request for a human operator to perform a safe, UI-mediated mutation.

- **Layer**: Control plane / coordinator
- **User-facing**: Yes (operator initiates via UI/CLI)
- **Durable boundary**: `operator_action_requests` table
- **Authority owner**: Operator

The explicit bridge between human judgment and system state. Current safelisted actions: `retry_work_item`, `acknowledge_alert`. Future extensions (e.g., draft approval, decision override) must be added explicitly to the safelist before they become available.

---

### 2.4 Identity Lattice

| Identity | Format | Scope | Derivation |
|----------|--------|-------|------------|
| `context_id` | Domain-neutral string | Policy-relevant grouping | `conversation_id` for mailbox; `timer:{id}` for timer; etc. |
| `revision_id` | `{context_id}:rev:{ordinal}` | Snapshot of a context at a point in time | Ordinal incremented by foreman on material change |
| `work_item_id` | `wi_<uuid>` | Terminal schedulable unit | Random UUID |
| `execution_id` | `ex_<uuid>` | Bounded charter invocation | Random UUID |
| `evaluation_id` | `eval_<execution_id>` | Structured output summary | Derived from `execution_id` |
| `decision_id` | `fd_<work_item_id>_<action_type>` | Foreman proposal | Deterministic from work item + action |
| `outbound_id` | `ob_<decision_id>` | Executable command envelope | Derived from `decision_id` |
| `event_id` | `evt_<sha256>` | Compiler-normalized source record | Content-addressed hash of normalized payload |

#### Legacy Aliases

- `thread_id === conversation_id` — legacy alias. All new code uses `context_id`.
- `mailbox_id === scope_id` — legacy alias in some Graph adapter contexts.

### 2.5 Worker Registry

First-class worker identities with explicit concurrency policies:

| Worker | Executor Family | Policy | Responsibility |
|--------|----------------|--------|----------------|
| `process_executor` | `process` | `singleton` | Executes `process.run` intents via subprocess |
| `send_reply` | `outbound` | `singleton` | Creates drafts and sends reply messages |
| `non_send_actions` | `outbound` | `singleton` | Executes mark_read, move_message, set_categories |
| `outbound_reconciler` | `outbound` | `singleton` | Reconciles submitted commands with remote state |

### 2.6 Verticals

Verticals (mailbox, timer, webhook, filesystem, process) are **interchangeable projections, not organizing primitives**. Domain-specific semantics must be explicit and local, never implicit or generic.

---

### 2.7 Authority Classes

Authority classes classify what a component, tool, or command is allowed to do. They are a policy-enforced boundary, not a suggestion.

<a name="authority-derive"></a>
#### `derive`

Computes declared outputs from declared inputs. No side effects, no lifecycle state changes, no claiming, no leases.

- **Examples**: `refine`, `plan`, `validate`, `init` (artifact generation)
- **Safe to re-run**: Yes, idempotent or explicitly `--force`
- **Who may use**: Any component with access to the inputs

<a name="authority-propose"></a>
#### `propose`

Produces a structured proposal that requires governance approval before it becomes an intent.

- **Examples**: charter evaluation, task graph proposals, domain-pack refinements
- **Safe to re-run**: Yes
- **Who may use**: Charters, domain packs, compiler tools

<a name="authority-claim"></a>
#### `claim`

Acquires exclusive rights to a schedulable unit or resource.

- **Examples**: claiming a work item, acquiring a lease
- **Safe to re-run**: No — requires concurrency control
- **Who may use**: Narada runtime-authorized components only

<a name="authority-execute"></a>
#### `execute`

Performs an effect that mutates external world state or consumes resources.

- **Examples**: invoking a tool, running a subprocess, sending a message
- **Safe to re-run**: Only if idempotent; generally requires crash/retry handling
- **Who may use**: Narada runtime-authorized executors only

<a name="authority-resolve"></a>
#### `resolve`

Advances lifecycle state (complete, reject, block, escalate, supersede).

- **Examples**: marking work completed, rejecting a task, blocking a dependency
- **Safe to re-run**: No — changes durable lifecycle state
- **Who may use**: Narada runtime-authorized governance components only

<a name="authority-confirm"></a>
#### `confirm`

Acknowledges that an external effect has been observed and binds it to durable state.

- **Examples**: confirming a sent message, reconciling remote state
- **Safe to re-run**: Idempotent by design
- **Who may use**: Narada runtime-authorized confirmation workers only

<a name="authority-admin"></a>
#### `admin`

Overrides policy or changes structural configuration.

- **Examples**: posture escalation, charter binding changes, operator override
- **Safe to re-run**: No — changes governance structure
- **Who may use**: Explicit operator/admin posture only

#### Policy Enforcement

- Domain packs may define only `derive` and `propose` capabilities.
- Only Narada runtime-authorized components may perform `claim`, `execute`, `resolve`, or `confirm`.
- `admin` requires explicit operator/admin posture.
- Charter runtime envelopes must expose the capability authority class.
- Preflight must reject operation configs that bind a charter or tool to an authority class it is not allowed to use.

---

### 2.8 Re-Derivation and Recovery Operator Family

Narada defines a family of explicit operators that recompute downstream state from durable boundaries. These are not a single vague "replay" — each member has distinct semantics, authority requirements, and safety properties.

#### 2.8.1 Operator Algebra

Every member is described by:

```text
Boundary A → Boundary B
mode: live | replay | preview | recovery | rebuild | confirm
effect: read-only | control-plane-mutating | external-confirmation-only
authority: <class from §2.7>
```

| Dimension | Meaning |
|-----------|---------|
| **Boundary A** | The durable upstream boundary used as input (e.g. `Fact`, `Execution`, `Durable state`) |
| **Boundary B** | The downstream boundary being recomputed (e.g. `Work`, `Context`, `Observation`, `Confirmation`) |
| **mode** | Whether the operator runs as part of live flow, replays a past path, previews a hypothetical, recovers from loss, rebuilds a projection, or replays confirmation |
| **effect** | Whether the operator is read-only, mutates control-plane state, or only updates confirmation bindings |
| **authority** | The authority class governing who may invoke the operator |

#### 2.8.2 Family Members

| Operator | A → B | Mode | Effect | Authority | Description |
|----------|-------|------|--------|-----------|-------------|
| **Live Fact Admission** | `Fact` → `Work` | `live` | `control-plane-mutating` | `resolve` (foreman) | Normal daemon dispatch: facts form contexts, foreman opens work. Baseline path, coupled to source sync. |
| **Replay Derivation** | `Fact` → `Work` | `replay` | `control-plane-mutating` | `derive` + `resolve` | Explicit operator-triggered re-derivation of work from already-stored facts using the same context-formation + foreman admission path as live dispatch. No fresh source delta required. |
| **Preview Derivation** | `Fact` → `PolicyContext`/`Evaluation` | `preview` | `read-only` | `derive` | Read-only inspection of what a charter would propose for a stored fact set. Runs context formation and charter evaluation but stops before work opening, lease claiming, or intent creation. |
| **Recovery Derivation** | `Fact` → `Context`/`Work` | `recovery` | `control-plane-mutating` | `derive` + `resolve` + `admin` | Rebuilds recoverable control-plane state after control-plane loss while facts remain intact. Conservative: does not restore active leases or in-flight execution attempts. |
| **Projection Rebuild** | `Durable state` → `Observation` | `rebuild` | `read-only`* | `derive` | Recomputes non-authoritative derived views (search indexes, observation read models) from canonical durable stores. May write to derived stores, but must not mutate canonical truth. |
| **Confirmation Replay** | `Execution`/`Outbound` → `Confirmation` | `confirm` | `external-confirmation-only` | `confirm` | Recomputes confirmation state from durable execution/outbound records plus current observation, without re-performing the effect. |

\* Projection rebuild writes to derived stores but not to canonical durable boundaries; its effect on system correctness is read-only.

#### 2.8.3 Semantic Distinctions

These six modes must never be treated as a single vague "replay" bucket:

| Distinction | Rule |
|-------------|------|
| **Live vs Replay** | Live admission is coupled to source sync and marks facts `admitted`; replay reads stored facts independently of `admitted_at` |
| **Replay vs Preview** | Replay advances control-plane state (opens work); preview is read-only |
| **Replay vs Recovery** | Replay is bounded, operator-triggered, and scoped; recovery is loss-shaped and may re-derive broader control-plane state |
| **Recovery vs Rebuild** | Recovery rebuilds authoritative control-plane state; rebuild only reconstructs non-authoritative projections |
| **Replay/Rebuild vs Confirm** | Replay and rebuild derive from upstream durable boundaries; confirm derives from execution/outbound state outward |
| **All vs Live** | No family member may run automatically on normal daemon startup unless it is live admission |

#### 2.8.4 Safety Properties

1. **Boundedness**: Every operator accepts explicit selection bounds (scope, context, time range, fact set). No background component continuously re-derives.
2. **Authority Preservation**: Replay and recovery preserve foreman authority over work opening, scheduler authority over leases, and outbound handoff authority over command creation.
3. **No Fabrication**: Replay, preview, and recovery must not fabricate source events or fresh inbound deltas.
4. **Conservative Recovery**: Recovery does not restore active leases, in-flight execution attempts, or already-submitted outbound effects blindly.
5. **Projection Non-Authority**: Rebuild may discard and recompute derived stores without affecting correctness.

#### 2.8.5 Relationship to Authority Classes

- `derive`: Required by preview, rebuild, and the computation phase of replay/recovery
- `resolve`: Required when the operator advances work-item lifecycle state (live, replay, recovery)
- `confirm`: Required for confirmation replay
- `admin`: Required for recovery because it reconstructs control-plane state after loss
- `claim` / `execute`: Not directly invoked by the operator family; these remain the authority of scheduler and worker layers during normal execution of replay-derived work

#### 2.8.6 Evolution Note

This family is documented before all members are implemented. The first concrete implementation is replay derivation (`Fact` → `Work`). As implementation proceeds, the algebra may be refined — for example, if replay and recovery share a common derivation core, that will be reflected here rather than freezing divergent names prematurely.

---

<a name="prohibited-terms"></a>
## 3. Prohibited Terms

Words that should not be used in user-facing or generic system contexts:

| Word | Why | Use Instead |
|------|-----|-------------|
| `agent` | Too generic; implies autonomy without governance | `charter` for the policy role, `operation` for the live arrangement |
| `instance` | Implies a running process, not the configured intent | `operation` |
| `deployment` | Implies infrastructure/Ops overhead | `operation` or `ops repo` |
| `workspace` | Too vague; conflicts with editor workspaces | `ops repo` |
| `setup` | A verb, not a noun for the live thing | `operation` |

---

## 4. Invariants (Derived from Ontology)

1. **All external change enters as Fact**
2. **All effects originate as Intent**
3. **Only Policy (Foreman) may create intents**
4. **System must be replay deterministic**
5. **Observation must not affect control**
6. **Kernel must remain vertical-neutral**

---

## 5. Relationship to Other Documents

| Document | Role | Relationship to Semantics |
|----------|------|--------------------------|
| [`TERMINOLOGY.md`](TERMINOLOGY.md) | User-facing term guide | **Subordinate**: `TERMINOLOGY.md` presents the user-facing subset. If there is ever a contradiction, `SEMANTICS.md` wins. |
| [`docs/00-kernel.md`](packages/layers/control-plane/docs/00-kernel.md) | Normative lawbook | **Elaborates**: formal interfaces, invariants, and failure model. Definitions here must match `SEMANTICS.md`. |
| [`docs/00-dharma-stewart.md`](packages/layers/control-plane/docs/00-dharma-stewart.md) | Steward handoff | **Contextualizes**: high-level ontology for human stewards. Concrete definitions are in `SEMANTICS.md`. |
| [`docs/01-spec.md`](packages/layers/control-plane/docs/01-spec.md) | Dearbitrized specification | **Formalizes**: algebraic properties and minimal completeness. Uses terms defined here. |
| [`docs/02-architecture.md`](packages/layers/control-plane/docs/02-architecture.md) | Component layers and data flow | **Illustrates**: how the ontology is implemented. Vocabulary notes must not redefine terms. |
| [§2.8](SEMANTICS.md#re-derivation-and-recovery-operator-family) | Re-derivation / recovery operator family | **Defines**: the algebra, members, and authority mapping for bounded recomputation between durable boundaries |
| [`docs/04-identity.md`](packages/layers/control-plane/docs/04-identity.md) | Identity and determinism | **Specializes**: identity schemes, serialization, and hashing. Assumes the ontology here. |
| [`AGENTS.md`](AGENTS.md) | Agent navigation hub | **Indexes**: concept-to-file lookup table. Definitions point here. |

---

## 6. How to Extend

1. Propose the new term in an issue or task file
2. Add it to this document with a clear definition and layer assignment
3. Update `AGENTS.md` concept table with the primary location
4. If the term is a new re-derivation/recovery operator, add it to §2.8 and ensure it is distinguished from existing family members
5. If user-facing, also update `TERMINOLOGY.md`
6. Never redefine an existing term; deprecate and alias instead
