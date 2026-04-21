# Cloudflare Live Adapter Boundary Contract

> Defines which fixture seams may become live adapters in the Cloudflare Site v1 chapter (Tasks 351–357), which authority boundaries must remain unchanged, and the no-overclaim posture for live-safe executability.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Fixture-Backed Spine (Tasks 345–350)

Tasks 345–350 established a fixture-backed kernel spine inside the Cloudflare Cycle runner. Steps 2–6 use typed handlers operating over real DO SQLite tables, but the data entering at each seam is synthetic or externally injected:

| Step | Handler | Fixture Seam | Durable Output |
|------|---------|--------------|----------------|
| 2 | `createSyncStepHandler` | `FixtureSourceDelta[]` injected by test/caller | `facts`, `apply_log`, `source_cursors` |
| 3 | `createDeriveWorkStepHandler` | Reads unadmitted `facts` rows | `context_records`, `work_items` |
| 4 | `createEvaluateStepHandler` | `fixtureEvaluate()` — pure deterministic evaluator | `evaluations` |
| 5 | `createHandoffStepHandler` | Reads `evaluations` with `propose_action` | `decisions`, `outbound_commands` |
| 6 | `createReconcileStepHandler` | `FixtureObservation[]` injected by test/caller | `outbound_commands` status transitions |

**Invariant preservation in the fixture spine:**

- Facts ≠ context/work: Step 2 persists raw facts; Step 3 derives context and work separately.
- Evaluation ≠ decision: Step 4 produces evaluation evidence; Step 5 creates governed decisions.
- Decision ≠ intent/handoff: Step 5 creates decisions and outbound commands as separate durable records.
- Confirmation requires observation: Step 6 confirms only against externally provided `FixtureObservation` — self-confirmation is structurally impossible.

---

## 2. Adapter Taxonomy

A **live adapter** replaces a fixture seam with a bounded interaction against an external system. The taxonomy below classifies every adapter type relevant to the Cloudflare Site v1 chapter.

| Adapter Class | Direction | Authority | In Scope? |
|---------------|-----------|-----------|-----------|
| **source-read** | External → Site | Reads external state; admits as facts | **Yes** (Task 352) |
| **charter-runtime** | Site → external API | Runs evaluator in Sandbox; produces evidence | **Yes** (Task 353) |
| **reconciliation-read** | External → Site | Observes external effect state; provides observations | **Yes** (Task 354) |
| **operator-control** | Operator → Site | Audited mutation of work items / decisions | **Yes** (Task 355) |
| **effect-execution** | Site → external | Performs side effects (send, draft, move) | **No** — out of scope for this chapter |

**Effect-execution adapter** (send reply, create draft, move message, etc.) is **explicitly out of scope**. The chapter may create durable `outbound_commands` and `decisions`, but no adapter in Tasks 351–357 is permitted to call a mutating external API to execute those commands. Execution remains deferred to a later chapter.

---

## 3. In-Scope Live Seams (Tasks 352–355)

### 3.1 Source-Read Adapter (Task 352)

**Purpose:** Replace `FixtureSourceDelta[]` injection with a bounded live read from an external source.

**Allowed behavior:**

- Call a read-only or delta API (e.g., Microsoft Graph delta query, webhook ingress, or similar).
- Normalize responses into `FactRecord` shape.
- Admit facts through the same `facts` / `apply_log` / `source_cursors` boundary as Step 2.
- Update source cursor durably inside the same atomic transaction as fact admission.

**Forbidden behavior:**

- Open work items directly from source data (must route through derive-work step).
- Skip fact identity / apply-log deduplication.
- Perform mutations on the external system during the read phase.

**Failure mode:** Adapter failure must leave cursor and apply-log in a consistent state. Partial admission is acceptable only if the cursor is not advanced past uncommitted facts.

**Identity note:** For v0 single-Site, single-scope setups, `site_id` and `scope_id` coincide. A source-read adapter operates against the Site's configured sources and admits facts scoped to that Site. Multi-scope resolution is deferred to v1.

### 3.2 Charter-Runtime Adapter (Task 353)

**Purpose:** Replace `fixtureEvaluate()` with real charter evaluation inside the Cloudflare Sandbox or another bounded execution locus.

**Allowed behavior:**

- Receive a `CharterInvocationEnvelope`-like input (context, policy, allowed actions, tool catalog).
- Produce an evaluation record (`propose_action`, `no_action`, `defer`) as durable evidence.
- Run inside a timeout/memory-bounded environment.

**Forbidden behavior:**

- Create decisions directly from evaluator output.
- Execute tools that mutate external state.
- Write to coordinator or outbound stores directly.

**Blocker policy:** If the Sandbox cannot support the full charter runtime (network constraints, package size limits, secret binding issues), Task 353 must produce a concrete blocker proof. It must not fabricate runtime success. The fixture evaluator remains an honest fallback.

### 3.3 Reconciliation-Read Adapter (Task 354)

**Purpose:** Replace `FixtureObservation[]` injection with a bounded live observation of external effect state.

**Allowed behavior:**

- Call a read-only API to observe the state of previously submitted effects (e.g., Graph message list, sent folder, draft status).
- Produce observations that feed into the reconcile step.
- Provide observations that enable the reconcile step to confirm `outbound_commands` when the external state matches the expected state.

**Forbidden behavior:**

- Create decisions or evaluations during reconciliation.
- Treat API success from an earlier effect attempt as confirmation.
- Self-confirm from the existence of an `outbound_command` row.
- Mutate external state during the read phase.

**Failure mode:** Adapter failure must not fabricate confirmation. Missing or stale observations must leave `outbound_commands` in their prior state. The adapter must not infer success from the absence of data.

### 3.4 Operator-Control Adapter (Task 355)

**Purpose:** Add audited operator mutations (approve, reject, retry, cancel) to the Cloudflare Site control surface.

**Allowed behavior:**

- Accept explicit operator actions via HTTP endpoint.
- Validate target state before mutation.
- Write an audit record (actor, action type, target, payload, result, timestamp).
- Transition work items or decisions according to the existing authority model.

**Forbidden behavior:**

- Bypass audit logging.
- Execute effects directly from an operator action.
- Allow invalid state transitions (e.g., approve a terminal work item).
- Mutate observation endpoints (observation remains read-only).

**Failure mode:** Invalid operator actions must be rejected without mutation. Audit records must be written for both accepted and rejected actions. Operator action failure must not crash the Cycle or corrupt work-item state.

---

## 4. Out-of-Scope Seams

The following seams are **explicitly out of scope** for Tasks 351–357. No adapter, handler, or document in this chapter may implement or claim them:

| Seam | Why Out of Scope | When It May Return |
|------|------------------|-------------------|
| **effect-execution** (send, draft, move) | Would cross from read-safe proof into unreviewed autonomous side effects | Later chapter with explicit authority review and operator-approval wiring |
| **autonomous send** | Violates "draft-first, confirm-second" invariant and human-approval policy | Only after full operator-control and confirmation pipeline is proven |
| **generic Runtime Locus abstraction** | Would over-abstract before second substrate exists | After at least one additional Site materialization (e.g., local container, AWS) |
| **multi-Site orchestration** | Scope is one Site, one Aim, one Cycle | v1 or later when multi-Site scaling pressure is real |
| **production readiness** | Live-safe proof is bounded, monitored, and operator-supervised | Only after effect execution, failover, and observability chapters close |

---

## 5. Authority Boundaries Adapters Cannot Cross

Live adapters are **mechanical seams**, not authority sources. The following boundaries from the fixture spine remain untouched:

### 5.1 Fact Boundary (Kernel Invariant #1)

All external change enters as `Fact`. A source-read adapter may read and admit facts. It may **not** derive context, open work, or evaluate from source data without persisting facts first.

### 5.2 Foreman Governance Boundary

Only the derive-work + evaluate + handoff sequence may create `work_items`, `evaluations`, `decisions`, and `outbound_commands`. No adapter may short-circuit this sequence.

### 5.3 Evaluation/Decision Separation (Intent–Action–Separation Anti-Collapse)

Evaluator output is evidence. Decisions are governed authority. A charter-runtime adapter produces evaluations. It does **not** create decisions.

### 5.4 Confirmation Boundary

An `outbound_command` reaches `confirmed` only via reconciliation against an external observation. A reconciliation-read adapter provides observations. It does **not** confirm directly.

### 5.5 Audit Boundary

Operator mutations are audited. The operator-control adapter writes audit records. It does **not** mutate state without leaving a trace.

### 5.6 Advisory Signal Boundary

Health, notifications, and cycle traces remain advisory. Live adapters may emit advisory signals on failure, but they may **not** use health status or notifications as authority to skip governance steps.

---

## 6. No-Overclaim Language

Documents, tests, and comments in Tasks 351–357 must use bounded language. Use this table as a style guide:

| Instead of… | Use… |
|-------------|------|
| "production ready" | "live-safe proof" or "bounded live seam" |
| "autonomous send" | "durable outbound command created; execution deferred" |
| "full Graph sync" | "bounded source-read adapter" |
| "real charter runtime" (if blocked) | "blocked: {reason}; fixture fallback used" |
| "deployed Site" | "materialized Site substrate" |
| "confirmed by success" | "confirmed by external observation" |

The chapter's goal is **live-safe executability**: a bounded Cloudflare Site can execute a Cycle using at least one live adapter without corrupting durable state or bypassing governance. This is **not** production readiness.

---

## 7. Task Reference

| Task | Adapter Class | Contract Reference |
|------|---------------|-------------------|
| 351 | — (meta) | This document |
| 352 | source-read | §3.1, §5.1 |
| 353 | charter-runtime | §3.2, §5.3 |
| 354 | reconciliation-read | §3.3, §5.4 |
| 355 | operator-control | §3.4, §5.5 |
| 356 | — (integration) | §6 (no-overclaim), §5 (all boundaries) |
| 357 | — (closure) | §6, §4 (out-of-scope table) |

---

## 8. Cross-References

| Document | Relationship |
|----------|--------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace |
| [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) | Cloudflare resource mapping, Cycle steps, v0/v1 boundary |
| [`docs/deployment/cloudflare-site-manifest.md`](cloudflare-site-manifest.md) | Site manifest schema (sources, policy, Cloudflare bindings) |
| [`docs/deployment/cloudflare-effect-execution-authority-contract.md`](cloudflare-effect-execution-authority-contract.md) | Effect-execution authority contract for Tasks 358–364 — state transitions, eligibility, confirmation separation |
| [`.ai/tasks/20260421-351-357-cloudflare-live-adapter-spine.md`](../../.ai/tasks/20260421-351-357-cloudflare-live-adapter-spine.md) | Chapter DAG and closure criteria |
| [`.ai/decisions/20260421-350-cloudflare-kernel-spine-closure.md`](../../.ai/decisions/20260421-350-cloudflare-kernel-spine-closure.md) | Closure of the fixture-backed kernel spine (Tasks 345–350) |
