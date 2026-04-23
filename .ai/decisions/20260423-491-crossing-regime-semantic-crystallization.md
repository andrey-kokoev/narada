---
closes_tasks: [491]
decided_at: 2026-04-23
decided_by: a2
---

# Decision: Crossing Regime Semantic Crystallization

## Verdict

**ACCEPTED.** The tuple `(zone, boundary, crossing regime, crossing artifact)` is a valid Narada-level semantic object, not merely a metaphor. It is the unifying abstraction that explains the structural isomorphism across the nine-layer pipeline, all operator families, authority classes, and task-governance boundaries.

The concept is already implicitly encoded throughout Narada (§2.8 operator algebra, §2.13 boundary ownership, §2.14 control cycle phases). This decision makes it explicit.

## Definitions

### Zone

A **zone** is a region of authority homogeneity — a conceptual region within which a single authority owner governs state and transitions.

| Zone | Authority Owner | Canonical Objects |
|------|----------------|-------------------|
| Source | Source adapter (`derive`) | Remote records, checkpoints, cursors |
| Fact | Source adapter + normalizer (`derive`) | `fact_id`, `event_id`, normalized payload |
| Context | Context formation strategy (`derive`) | `context_id`, `revision_id`, `PolicyContext` |
| Work | Foreman (`resolve`) | `work_item_id`, `work_item` status |
| Evaluation | Charter runtime (`propose`) | `evaluation_id`, `CharterOutputEnvelope` |
| Decision | Foreman (`resolve`) | `decision_id`, `foreman_decision` |
| Intent | Foreman handoff (`resolve` → `execute`) | `intent_id`, `outbound_handoff` |
| Execution | Worker (`execute`) | `execution_id`, `execution_attempt` |
| Confirmation | Reconciler (`confirm`) | Confirmation status, `apply_log` |
| Observation | Observation layer (read-only) | Derived views, projections, traces |
| Operator | Operator (`admin`) | `operator_action_request` |
| Task | Task governance system (`claim`/`resolve`) | `TaskAssignment`, `TaskContinuation` |

Zones are **not** implementation modules. A single codebase file may touch multiple zones. Zones are semantic/authority regions.

### Boundary

A **boundary** is the interface between two adjacent zones. A boundary crossing is meaningful when it moves a durable artifact from one authority owner to another.

Not every function call is a boundary crossing. A boundary crossing requires:
1. A change in authority owner, AND
2. Production of a durable artifact, AND
3. An explicit admissibility regime governing the transition.

### Crossing Regime

A **crossing regime** is the explicit set of rules that determine what may cross a boundary, in what form, under what authority, and with what confirmation obligation.

Every crossing regime in Narada shares the same irreducible structure (see §Irreducible Fields below).

### Crossing Artifact

A **crossing artifact** is the durable record produced by a boundary crossing. It is the token that proves the crossing occurred and carries state from the source zone into the destination zone.

## Isomorphism with Existing Structures

The crossing-regime concept does not introduce new runtime machinery. It reveals structure that is already present:

| Existing Structure | Crossing-Regime Reading |
|-------------------|------------------------|
| Nine-layer pipeline (§2.1) | Sequence of zone-to-zone boundary crossings |
| Operator algebra `Boundary A → Boundary B` (§2.8) | Crossing regime parameterized by mode, effect, authority |
| Boundary ownership table (§2.13.2) | Authority owner per boundary crossing |
| Control cycle phases (§2.14.7) | Canonical ordering of crossing regimes |
| Authority classes (§2.7) | The permission grammar of who may initiate which crossing |
| Assignment intent enum (Decision 490) | Task-zone crossing regime classification |

## Canonical Cases Mapped

### 1. Fact Admission

| Field | Value |
|-------|-------|
| Source zone | Source (remote world) |
| Destination zone | Fact (canonical durable boundary) |
| Authority owner | Source adapter + normalizer (`derive`) |
| Admissibility regime | Deterministic normalization + content-addressed `event_id` + idempotent ingestion |
| Crossing artifact | `Fact` record (`fact_id`, `fact_type`, `payload_json`) |
| Confirmation rule | `event_id` collision → idempotent upsert; no external confirmation required because the artifact is self-certifying (content hash) |

**Anti-collapse invariant**: Prevents world state from becoming prompt memory.

### 2. Intent Admission

| Field | Value |
|-------|-------|
| Source zone | Decision (foreman governance) |
| Destination zone | Intent (universal durable effect boundary) |
| Authority owner | Foreman handoff (`resolve`) |
| Admissibility regime | Decision must be `accept` (not `reject`, `escalate`, or `no-op`); atomic transaction with `outbound_handoff` creation |
| Crossing artifact | `Intent` record (`intent_id`, `idempotency_key`, `payload_json`) |
| Confirmation rule | Intent is not confirmed at crossing time; confirmation happens downstream via execution → reconciliation |

**Anti-collapse invariant**: Prevents approval from becoming direct effect.

### 3. Operator Action Request

| Field | Value |
|-------|-------|
| Source zone | Operator (human/admin authority) |
| Destination zone | Control plane (system mutation surface) |
| Authority owner | Operator (`admin`) + identity provider confirmation |
| Admissibility regime | Recognized operator contact address → pending request + confirmation challenge → verified identity token → safelisted action |
| Crossing artifact | `operator_action_request` record |
| Confirmation rule | Challenge completion through configured identity provider (e.g., Microsoft/Entra verified token claims) |

**Anti-collapse invariant**: Prevents email desire from becoming direct mutation; email is admissible as input, not as authority.

### 4. Task Completion

| Field | Value |
|-------|-------|
| Source zone | Work (agent implementation) |
| Destination zone | Review/Closure (governance) |
| Authority owner | Primary agent (`claim`) for report; reviewer/operator (`resolve`/`admin`) for acceptance |
| Admissibility regime | Report submission with evidence artifact → review validation → status transition to `closed` |
| Crossing artifact | Task report / review artifact |
| Confirmation rule | Review artifact exists and passes acceptance criteria; for tasks with review assignment, reviewer sign-off required |

**Anti-collapse invariant**: Prevents self-reported completion from becoming terminal status without external validation.

### 5. Task Attachment / Carriage

| Field | Value |
|-------|-------|
| Source zone | Agent (roster principal) |
| Destination zone | Task (governance object) |
| Authority owner | Agent (`claim`) for self-assignment; operator (`admin`) for override |
| Admissibility regime | Intent enum (`primary`, `review`, `repair`, `takeover`) + reason + dependency check + exclusivity rules |
| Crossing artifact | `TaskAssignment` record (or `TaskContinuation` for repair) |
| Confirmation rule | Roster state reflects attachment; for `primary`/`takeover`, at most one unreleased primary carriage at any time |

**Anti-collapse invariant**: Prevents attachment from being mistaken for carriage; preserves single-primary-carriage invariant.

### 6. Evaluation → Decision (Bonus: Intelligence-Authority Separation)

| Field | Value |
|-------|-------|
| Source zone | Evaluation (charter intelligence output) |
| Destination zone | Decision (authority output) |
| Authority owner | Foreman (`resolve`) |
| Admissibility regime | Policy validation of charter output + governance rules (accept / reject / escalate / no-op) |
| Crossing artifact | `foreman_decision` record |
| Confirmation rule | Decision is append-only; reversal requires new decision, not mutation |

**Anti-collapse invariant**: Prevents model judgment from becoming permission.

### 7. Execution → Confirmation (Bonus: Reconciliation)

| Field | Value |
|-------|-------|
| Source zone | Execution (worker effect attempt) |
| Destination zone | Confirmation (durable truth) |
| Authority owner | Reconciler (`confirm`) |
| Admissibility regime | External observation or inbound reconciliation proves the effect took hold |
| Crossing artifact | Confirmation status update |
| Confirmation rule | Inbound observation matches expected outcome; API success alone is insufficient |

**Anti-collapse invariant**: Prevents API success from becoming assumed truth.

## Irreducible Fields

Every crossing regime in Narada contains at least these six irreducible fields:

| Field | Meaning | Narada Example |
|-------|---------|----------------|
| **source_zone** | The zone providing the artifact | `Source`, `Evaluation`, `Operator`, `Agent` |
| **destination_zone** | The zone receiving the artifact | `Fact`, `Decision`, `Control`, `Task` |
| **authority_owner** | The component/role with permission to govern this crossing | `Foreman`, `Source adapter`, `Operator`, `Reviewer` |
| **admissibility_regime** | The explicit rules for what may cross, in what form | Content hash, policy validation, identity challenge, intent enum |
| **crossing_artifact** | The durable record produced by the crossing | `Fact`, `Intent`, `operator_action_request`, `TaskAssignment` |
| **confirmation_rule** | How the crossing is verified or reconciled | Self-certifying hash, downstream execution, challenge token, roster exclusivity, inbound observation |

No crossing regime in Narada omits any of these six fields. A transition that lacks one is either:
- Not a meaningful boundary crossing (e.g., an in-memory computation within a single zone), or
- An authority collapse (e.g., evaluation directly mutating durable state without a decision).

## Invariants

1. **No crossing without regime**: Every zone-to-zone boundary crossing that produces a durable artifact must have an explicit crossing regime.
2. **Authority changes at boundaries**: If a transition does not change authority owner, it is not a boundary crossing (it is an internal state transition within a zone).
3. **Artifacts are durable**: A crossing artifact must be durable enough to survive a crash in either zone. Ephemeral signals do not qualify.
4. **Confirmation is downstream or self-certifying**: Every crossing either carries its own proof (content hash) or defines how it will be confirmed later (reconciliation, review, challenge).
5. **Regimes are not transitive shortcuts**: Crossing regimes compose sequentially, not by skipping zones. `Source → Fact → Context → Work` is valid; `Source → Work` is an authority collapse.

## Relationship to Operator Families

The operator families defined in §2.8–§2.11 are **crossing-regime operators** parameterized by mode:

| Operator Family | What It Does to Crossing Regimes |
|----------------|----------------------------------|
| Re-derivation (§2.8) | Replays or previews a crossing regime using stored artifacts from an earlier zone |
| Selection (§2.9) | Bounds which artifacts may enter a crossing regime |
| Promotion (§2.10) | Advances an artifact to the next zone under explicit operator trigger |
| Inspection (§2.11) | Observes artifacts within a zone without initiating a crossing |

This confirms that operator families are already organized around the crossing-regime abstraction.

## What This Decision Does

- Adds §2.15 to `SEMANTICS.md` crystallizing the crossing-regime concept.
- Updates `AGENTS.md` concept table with crossing-regime entries.
- Provides the semantic foundation for later work that needs to reason about boundaries generically.

## What This Decision Does NOT Do

- Does not introduce a `CrossingRegime` class or generic runtime abstraction.
- Does not rename existing concrete types (`Fact`, `Work`, `Intent`, `TaskAssignment`).
- Does not change any code path or CLI command.
- Does not force every subsystem into a fake linear pipeline.

## Closure Statement

The crossing-regime concept is accepted as a valid Narada-level semantic object. It is the unifying lens that explains why the nine-layer pipeline, authority classes, operator families, and task-governance boundaries share the same structural shape. The six irreducible fields are documented, seven canonical cases are mapped, and the concept is added to canonical semantics without runtime changes.
