# Decision: Implicit State Machine Inventory

**Date:** 2026-04-22
**Task:** 409
**Depends on:** 406 (Principal Runtime State Machine Design), 397 (Session Attachment Semantics), 396 (Narada Learning Loop Design)
**Verdict:** **Design accepted — three state machines recommended for explicit treatment; five remain derived, advisory, or documented-only.**

---

## Summary

Narada already has six well-defined explicit state machines in production code. This inventory examines nine additional concepts that behave like implicit state machines and decides which deserve explicit treatment.

**Bottom line:**

| Decision | Candidates |
|----------|-----------|
| **Already explicit** | `PrincipalRuntime`, `WorkItem`, `OutboundCommand`, `ExecutionAttempt`, `Task` (construction governance), `Health`/`Cycle` |
| **Explicit later** | `SiteAttachment`, `OperationReadiness`, `LearningArtifact` |
| **Derived only** | `CredentialReadiness`, `KnowledgeSourceReadiness`, `ExternalObservationLifecycle` (per-family) |
| **Advisory only** | `ReviewFindingLifecycle` |
| **No state machine** | `ChapterLifecycle` |

Only three concepts pass the extraction criteria. The rest either already have sufficient explicit structure, are better served by on-demand derivation, or would introduce performative complexity.

---

## 1. Baseline: Already-Explicit State Machines

Before evaluating candidates, acknowledge the existing explicit state machines that are working well:

| State Machine | Location | States | Storage | Authority |
|---------------|----------|--------|---------|-----------|
| `WorkItem` | `coordinator/types.ts` | 8 (`opened` → `leased` → `executing` → `resolved`/`failed_retryable`/`failed_terminal`/`superseded`/`cancelled`) | SQLite `work_items` | Scheduler (lease), Foreman (resolution) |
| `OutboundCommand` | `outbound/types.ts` | 12 (`pending` → `draft_creating` → `draft_ready` → `approved_for_send` → `sending` → `submitted` → `confirmed`, plus `retry_wait`, `blocked_policy`, `failed_terminal`, `cancelled`, `superseded`) | SQLite `outbound_handoffs` + `outbound_versions` | Outbound workers |
| `ExecutionAttempt` | `coordinator/types.ts` | 5 (`started` → `active` → `succeeded`/`crashed`/`abandoned`) | SQLite `execution_attempts` | Scheduler + executor |
| `AgentSession` | `coordinator/types.ts` | 6 (`opened` → `active` → `idle`/`completed`/`abandoned`/`superseded`) | SQLite `agent_sessions` | Foreman (trace) |
| `Task` (construction) | `cli/src/lib/task-governance.ts` | 7 (`draft` → `opened` → `claimed` → `in_review`/`needs_continuation` → `closed` → `confirmed`) | Markdown front-matter + `.ai/tasks/` | Task governance operators |
| `Health` / `Cycle` | `health.ts`, `health-multi.ts` | 7 (`healthy`, `degraded`, `critical`, `auth_failed`, `stale`, `error`, `stopped`) | `.health.json`, `.multi-health.json` | Sync runner |
| `PrincipalRuntime` | `principal-runtime/` | 11 (`unavailable` → `available` → `attached_observe`/`attached_interact` → `claiming` → `executing` → `waiting_review`, plus `detached`, `stale`, `budget_exhausted`, `failed`) | Ephemeral JSON / memory | Principal runtime (self) |

These are not the problem. The problem is the concepts that traverse implicit or fragmented lifecycles.

---

## 2. Candidate Inventory

### 2.1 `PrincipalRuntime`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | None — already explicit |
| **Current storage** | `packages/layers/control-plane/src/principal-runtime/` (types, state-machine, registry); ephemeral JSON or in-memory |
| **Authoritative / advisory / derived** | Advisory (ephemeral by design) |
| **Consequences of leaving implicit** | Already addressed — Task 406 designed and implemented this |
| **Consequences of making explicit** | Already done |
| **Decision** | ✅ **Already explicit** — no action needed |

**Note:** The subagent exploring the codebase found `PrincipalRuntime` already implemented with full transition validation, registries (`InMemoryPrincipalRuntimeRegistry`, `JsonPrincipalRuntimeRegistry`), and CLI commands (`narada principal status/attach/detach/list`). This is the model for how the remaining candidates should be evaluated.

---

### 2.2 `SiteAttachment`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | `attached` → `detached` → `stale` → `transferred` → `closed` (designed in Decision 397, no code yet) |
| **Current storage** | None — design specifies console registry / agent runtime state |
| **Authoritative / advisory / derived** | Advisory (ephemeral by design; §2.12 of Decision 397) |
| **Consequences of leaving implicit** | Multi-principal console cannot track who is connected; stale detection requires ad-hoc heartbeats; transfer semantics are undefined in code |
| **Consequences of making explicit** | Enables `narada site attach/detach/reattach/transfer`; heartbeat staleness detection; resume context projection; single active controller enforcement |
| **Decision** | 📋 **Explicit later** — design is complete (Decision 397), implementation deferred until multi-principal console is built |

**Rationale:** `SiteAttachment` is the transport-layer counterpart to `PrincipalRuntime`. Without it, the daemon's default principal is the only runtime actor, which is sufficient for single-principal deployments. Once the operator console or multi-agent dispatch is needed, `SiteAttachment` becomes essential.

---

### 2.3 `LearningArtifact`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | `candidate` → `reviewed` → `accepted`/`rejected`/`superseded` (designed in Decision 396, no code yet) |
| **Current storage** | None — design specifies `.ai/learning/candidates/`, `.ai/learning/accepted/`, `index.json` |
| **Authoritative / advisory / derived** | Advisory (§3.4 of Decision 396: "Removing every learning artifact from the system must leave all durable boundaries intact") |
| **Consequences of leaving implicit** | Learning loop cannot function — no artifact tracking, no anti-bloat enforcement, no review/acceptance workflow |
| **Consequences of making explicit** | Enables `narada task learn` CLI surface; enforces anti-bloat rules (repetition, negation, TTL); prevents agent self-mutation |
| **Decision** | 📋 **Explicit later** — design is complete (Decision 396), implementation deferred to tasks 397–400 |

**Rationale:** The state machine is well-designed and the authority boundaries are correct (`candidate` → `derive`; `accepted` → `admin`). But no runtime component consumes learning artifacts yet, so the cost of implementation exceeds the immediate benefit.

---

### 2.4 `CredentialReadiness`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | Ad-hoc: config loaded → secret resolved → probe succeeds/fails |
| **Current storage** | None — live probes only (`doctor.ts`, `service.ts` dispatch health check) |
| **Authoritative / advisory / derived** | Derived |
| **Consequences of leaving implicit** | Operator must run `narada doctor` to discover credential issues; no durable history of auth failures |
| **Consequences of making explicit** | Would add a trivial state machine (`unconfigured` → `configured` → `verified` → `failed`) that duplicates config loader and doctor behavior |
| **Decision** | 📊 **Derived only** — do not create a durable state machine |

**Rationale:** Credentials are resolved at config load time. If missing, loading throws immediately. If present but invalid, the Graph adapter or charter runner fails during execution, which is already surfaced via `Health`/`Cycle` state and `doctor`. A separate `CredentialReadiness` SM would track the same information at a different granularity without removing ambiguity. The Windows credential contract (`docs/deployment/windows-credential-path-contract.md`) already defines the resolution precedence; no lifecycle is needed.

---

### 2.5 `KnowledgeSourceReadiness`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | Ad-hoc: declared in config → filesystem read at materialization time → present/absent |
| **Current storage** | Config declaration only; no runtime state |
| **Authoritative / advisory / derived** | Derived |
| **Consequences of leaving implicit** | Missing knowledge sources silently produce empty context materialization; operator may not notice a source is missing |
| **Consequences of making explicit** | Would track `declared` → `loading` → `available`/`failed`/`stale` states; requires background polling or watcher |
| **Decision** | 📊 **Derived only** — do not create a durable state machine |

**Rationale:** Knowledge sources are filesystem paths or URLs read at envelope-build time. Their "readiness" is a function of filesystem state at that instant. Adding a state machine would require a background watcher or periodic polling, which adds complexity without enabling bounded automation. The correct fix for silent empty materialization is a **preflight warning** ("declared knowledge source `foo.md` not found"), not a lifecycle.

---

### 2.6 `OperationReadiness`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | Fragmented across: `.activated` marker, `.health.json`, PID file, coordinator DB existence, config validity |
| **Current storage** | Fragmented markers + derived health file |
| **Authoritative / advisory / derived** | Derived today; could become authoritative |
| **Consequences of leaving implicit** | Operator must mentally integrate 5+ signals to determine if an operation is runnable; bootstrap contract (`docs/product/bootstrap-contract.md`) describes steps but does not enforce them; recovery from partial bootstrap requires guesswork |
| **Consequences of making explicit** | Unifies bootstrap contract into a single durable state record; enables `narada preflight` to write readiness state; enables automated onboarding flows; makes partial bootstrap recoverable |
| **Decision** | 📋 **Explicit later** — design a unified `OperationReadiness` state machine |

**Rationale:** The bootstrap contract defines five conceptual steps (express intent → init repo → select vertical → validate prerequisites → reach runnable state). Today, the only physical artifact tracking progress is the `.activated` marker. `narada preflight` and `narada doctor` derive readiness by probing filesystem state. A unified `OperationReadiness` record would replace this implicit choreography with explicit state: `uninitialized` → `repo_created` → `scope_configured` → `preflight_passed` → `activated` → `running` → `paused`/`degraded`/`failed`. This removes recurring ambiguity for operators and enables automated recovery from partial bootstrap.

**Risk:** Low. The states map directly to existing CLI commands and artifacts.

---

### 2.7 `ChapterLifecycle`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | Tasks have explicit states; chapters are derived aggregations (`scanTasksByChapter` + `chapter-close.ts` computes `confirmed`/`closed`/`in_review`/`in_progress`/`runnable`/`not_started` from constituent tasks) |
| **Current storage** | Task front-matter in `.ai/tasks/*.md`; chapter closure is a generated decision file, not a state record |
| **Authoritative / advisory / derived** | Derived |
| **Consequences of leaving implicit** | Chapter "state" is recomputed on demand; no durable chapter status; closure is gated on task states but not recorded |
| **Consequences of making explicit** | Would duplicate task state at a higher level; risk of drift between task state and chapter state; adds write dependency between task transitions and chapter record |
| **Decision** | ❌ **No state machine** — chapters remain derived aggregations |

**Rationale:** A chapter is a **view** over a set of tasks, not an independent entity. Its "state" is fully determined by the states of its constituent tasks. Adding a chapter-level state machine would create a synchronization problem: every task transition would need to update the chapter record, or the chapter record would be stale. The existing design — compute chapter state on demand from task files — is correct. The chapter closure decision file is an audit artifact, not a state record.

---

### 2.8 `ReviewFindingLifecycle`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | Static record shape (`severity`, `description`, `recommended_action`); `recommended_action` hints at intent (`fix`, `add_test`, `rewrite`, `defer`, `wontfix`) but has no status field or transitions |
| **Current storage** | Static JSON in `.ai/reviews/*.json` |
| **Authoritative / advisory / derived** | Advisory |
| **Consequences of leaving implicit** | Review findings have no tracked resolution state; operator must manually correlate findings with fixes |
| **Consequences of making explicit** | Would require linking findings to code changes, tracking fix verification, and maintaining finding state — essentially a lightweight issue tracker inside Narada |
| **Decision** | 📢 **Advisory only** — findings remain static records; resolution is operator judgment |

**Rationale:** `ReviewFinding` is an audit record produced during chapter closure or task review. It documents what a reviewer observed. Whether and how the finding is addressed is a construction workflow decision, not a system lifecycle. Adding a state machine (`open` → `in_progress` → `verified` → `closed`) would turn Narada into an issue tracker, which is out of scope. The `recommended_action` field is guidance, not a workflow trigger.

**Counter-argument considered:** Could findings be linked to `operator_action_requests` for tracked remediation? Yes, but that would make them promotion targets, not a distinct lifecycle. The existing operator action system is sufficient.

---

### 2.9 `ExternalObservationLifecycle`

| Attribute | Value |
|-----------|-------|
| **Current implicit states** | Per-family explicit: `OutboundStatus` (12 states), `WorkItemStatus` (8), `ExecutionAttemptStatus` (5), `AgentSessionStatus` (6). Cross-cutting: `ExecutionPhase` + `ConfirmationStatus` (4 + 3) in `executors/lifecycle.ts` |
| **Current storage** | SQLite (coordinator + outbound stores) |
| **Authoritative / advisory / derived** | Authoritative (durable) |
| **Consequences of leaving implicit** | Each vertical family (mail, process) defines its own observation/reconciliation pattern; cross-vertical queries require case-by-case mapping; confirmation replay semantics vary by family |
| **Consequences of making explicit** | A unified `ExternalObservationLifecycle` would abstract `submitted` → `confirmed` across all verticals; risks forcing dissimilar verticals into the same shape (vertical-neutrality violation) |
| **Decision** | 📊 **Derived only** — per-family explicit SMs are correct; cross-vertical unification stays in the mapping layer (`executors/lifecycle.ts`) |

**Rationale:** Each vertical has genuinely different external observation needs:

| Vertical | External State | Confirmation Mechanism |
|----------|---------------|----------------------|
| Mail | Graph API draft/message | `OutboundReconciler` polls Graph |
| Process | Subprocess exit code | Immediate on process termination |
| Timer | Cron trigger fired | Implicit (no external confirmation) |
| Webhook | HTTP response received | Immediate on 2xx response |

A unified state machine would either be so abstract it provides no value (`pending` → `observed`) or so specific it violates vertical neutrality. The existing `ExecutionLifecycle` mapping (`ExecutionPhase` + `ConfirmationStatus`) is the correct abstraction level: it provides cross-cutting query capability without dictating family-specific transitions.

---

## 3. Priority Ranking

Ranked list of state machines that should be made explicit first (top to bottom):

### 1. `SiteAttachment`

| Criterion | Score | Justification |
|-----------|-------|---------------|
| Reduction in manual choreography | **High** | Enables automatic stale detection, reattach, and transfer without operator guesswork |
| Authority-boundary clarity | **High** | Explicitly separates transport connection from scheduler lease and from authority envelope |
| Live-operation usefulness | **Medium** | Not needed for single-principal daemon; essential for multi-operator console |
| Implementation risk | **Low** | Design is complete (Decision 397); states are simple (5 states); no Site schema changes |
| Risk of premature abstraction | **Low** | Directly maps to `shpool` semantics; natural fit for Narada's attachment model |

### 2. `OperationReadiness`

| Criterion | Score | Justification |
|-----------|-------|---------------|
| Reduction in manual choreography | **High** | Replaces mental integration of 5+ fragmented markers with a single state query |
| Authority-boundary clarity | **Medium** | Clarifies what "ready to run" means; separates bootstrap state from runtime health |
| Live-operation usefulness | **High** | Every new operation goes through bootstrap; recovery from partial bootstrap is common |
| Implementation risk | **Low** | States map directly to existing CLI commands and artifacts |
| Risk of premature abstraction | **Low** | The bootstrap contract already exists; this just makes it durable and queryable |

### 3. `LearningArtifact`

| Criterion | Score | Justification |
|-----------|-------|---------------|
| Reduction in manual choreography | **Medium** | Enables automated extraction, review tracking, and anti-bloat enforcement |
| Authority-boundary clarity | **High** | The `accepted` gate prevents agent self-mutation; explicit authority mapping (`derive` → `resolve` → `admin`) |
| Live-operation usefulness | **Low** | No consumers exist yet; learning loop is not active |
| Implementation risk | **Low** | Design is complete (Decision 396); file-backed storage is simple |
| Risk of premature abstraction | **Medium** | Could build infrastructure before the loop has enough signal to be useful |

**No 4th or 5th candidate passes the extraction criteria.** `CredentialReadiness`, `KnowledgeSourceReadiness`, and `ExternalObservationLifecycle` are better served by derivation. `ReviewFindingLifecycle` and `ChapterLifecycle` would introduce performative complexity.

---

## 4. Extraction Criteria

> **A lifecycle deserves a durable state machine if and only if doing so preserves invariants, removes recurring ambiguity, or enables bounded automation.**

### 4.1 The Test

For any candidate, ask these questions in order:

1. **Does it already have an explicit state machine?** If yes, stop. Do not duplicate.
2. **Is it an aggregation or view over other state?** If yes, stop. Views stay derived.
3. **Does making it explicit remove ambiguity that operators encounter repeatedly?** If no, stop.
4. **Does making it explicit enable bounded automation that is currently manual?** If no, stop.
5. **Would the state machine have fewer than 15 states and a transition table that fits on one screen?** If no, reconsider — you may be modeling a domain, not a lifecycle.
6. **If every instance of this state machine were deleted, would durable boundaries remain intact?** If no, the SM may be conflated with authority.

### 4.2 Anti-Patterns (Performative Complexity)

A lifecycle should **not** become explicit if:

- **It is a function of config + live probe.** Credentials, API keys, and network reachability are derived from external reality. A state machine that tracks "API reachable / not reachable" is just a cache with extra steps.
- **It is an audit record with judgment.** Review findings, execution notes, and operator comments are evidence, not state. Their "lifecycle" is human workflow, not system mechanics.
- **It duplicates existing state at a different granularity.** Chapter state derived from task state, or "operation health" derived from work-item + outbound + sync health, are views, not independent machines.
- **It has no consumers.** A state machine with no code that queries or transitions it is dead weight.
- **It forces verticals into a common shape.** Each vertical's external observation pattern is genuinely different. Unification at the state-machine level violates vertical neutrality.

### 4.3 When Derived Is Correct

| Pattern | Why Derived Is Better |
|---------|----------------------|
| `CredentialReadiness` | Config loader + doctor already handle this; state would be a stale cache |
| `KnowledgeSourceReadiness` | Filesystem presence is the truth; a SM adds polling/watcher complexity |
| `ExternalObservationLifecycle` (unified) | Per-family SMs are correct; mapping layer provides cross-cutting queries |
| `ChapterLifecycle` | Chapter is a view over task state; adding SM creates synchronization risk |

---

## 5. Follow-Up Tasks

Proposed tasks, in dependency order. **Do not create these tasks unless explicitly instructed.**

| Order | Task Title | What It Does | Depends On | Priority |
|-------|-----------|--------------|------------|----------|
| 1 | **Implement `SiteAttachment` registry and CLI** | Console-registry storage for attachment state; `narada site attach/detach/reattach/transfer`; heartbeat staleness detection | 409 (this inventory), 397 | High |
| 2 | **Design `OperationReadiness` state machine** | Define states, transitions, and storage for unified operation readiness; map to existing bootstrap artifacts | 409 | High |
| 3 | **Implement `OperationReadiness` tracking** | Add readiness state to scope config or coordinator store; update `preflight` and `doctor` to read/write it; enable recovery from partial bootstrap | Task 2 above | Medium |
| 4 | **Implement learning artifact storage and CLI** | `.ai/learning/` directory, JSON schema, `narada task learn` commands, anti-bloat validation | 409, 396 | Medium |

**Not recommended:**
- `CredentialReadiness` SM — add a preflight warning for missing knowledge sources instead
- `KnowledgeSourceReadiness` SM — add a preflight warning for missing declared sources instead
- `ReviewFindingLifecycle` SM — keep findings static; link to operator actions if tracked resolution is needed
- `ExternalObservationLifecycle` unified SM — extend `executors/lifecycle.ts` mapping layer if new verticals need it
- `ChapterLifecycle` SM — keep chapters as derived views

---

## 6. Acceptance Criteria

- [x] Inventory artifact exists at `.ai/decisions/20260422-409-implicit-state-machine-inventory.md`.
- [x] Each candidate is classified as authoritative, advisory, derived, or no-state-machine.
- [x] Top priority list is ranked and justified against five criteria.
- [x] Extraction criteria are explicit and guard against performative complexity.
- [x] Follow-up tasks are proposed only if needed.
- [x] No implementation code is added.
- [x] No derivative task-status files are created.
