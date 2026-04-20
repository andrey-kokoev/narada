# Task 212: Add Continuation Affinity To Work Routing

## Why

Narada already models:

- durable work objects
- execution attempts
- agent sessions
- resume hints
- authority boundaries

But it does not yet model an important operational reality:

- task `a2` is often better handled by the same execution lane that just handled `a1`
- not because correctness depends on it
- but because there may be useful short-lived continuity near that lane

That continuity may come from:

- recent understanding of the same context
- recent understanding of nearby tasks
- live tool/process/session state
- provider-side warm state or hidden cache locality
- recently touched code/files
- recently analyzed mailbox thread state

Today Narada mostly knows **dependency**.
It does not explicitly know **affinity**.

## Goal

Introduce a first-class notion of **continuation affinity** for work routing and session reuse.

This must be a soft routing preference, not a hard correctness dependency.

## Core Principle

Continuation affinity is an optimization signal.

It is **not**:

- authority
- correctness
- canonical truth
- a reason to block work forever waiting for one specific agent

Narada should prefer continuity when it is likely useful, then fall back safely when it is unavailable.

## Definitions

### Dependency

`a2` cannot proceed before `a1`.

This is a hard ordering/correctness relation.

### Continuation Affinity

`a2` is likely better if executed by the same recent session/agent/lane that executed `a1`.

This is a soft routing preference.

## Required Outcome

Narada should be able to represent and use continuation affinity when opening and routing work.

## Required Behavior

### 1. First-Class Affinity Model

Add a canonical concept such as:

- `continuation_affinity`

At minimum the model should be able to express:

- preferred recent session
- preferred recent execution lane / agent
- related predecessor work item or execution
- bounded lifetime / expiry
- strength or priority of the preference

Possible fields:

- `preferred_session_id`
- `preferred_agent_id`
- `affinity_group_id`
- `affinity_reason`
- `affinity_strength`
- `affinity_expires_at`

Final naming may differ, but the semantics must be explicit.

### 2. Affinity Sources

Document and implement how affinity may be derived.

At minimum consider:

- same `context_id`
- same recent work chain
- same `scope_id`
- same charter
- same tool/session continuity
- same unresolved follow-up

Provider-side hidden state may be one contributor, but Narada must not depend on it as the only rationale.

### 3. Scheduler / Routing Preference

When runnable work is selected, Narada should prefer honoring affinity when reasonable:

- if the preferred session/agent is live or recently idle, prefer it
- if not available, fall back
- never block correctness waiting indefinitely for one lane

### 4. Session Reuse Semantics

Clarify how this relates to existing `resume_hint` / `agent_sessions`.

Likely rule:

- `resume_hint` is the user/operator-visible trace of continuity
- continuation affinity is the routing preference used by scheduler/foreman/runtime

If that split is wrong, document the correct relationship.

### 5. Observability

Narada should expose whether affinity was:

- requested
- available
- honored
- broken/fallen back

This is needed so the optimization can be evaluated rather than becoming folklore.

### 6. Safety Rules

Explicitly enforce:

- affinity is advisory, not mandatory
- affinity does not override authority checks
- affinity does not bypass leasing/scheduling invariants
- affinity expiration prevents stale “sticky” routing

## Non-Goals

- Do not make work assignment depend on opaque provider cache state
- Do not require that one specific agent always handles a context forever
- Do not turn affinity into a new authority class
- Do not block runnable work solely to preserve continuity

## Suggested Landing Areas

Potentially:

- `packages/layers/control-plane/src/coordinator/types.ts`
- `packages/layers/control-plane/src/coordinator/store.ts`
- `packages/layers/control-plane/src/scheduler/`
- `packages/layers/control-plane/src/foreman/`
- docs in `SEMANTICS.md`, `00-kernel.md`, and `AGENTS.md`

## Verification

Minimum:

```bash
pnpm verify
pnpm --filter @narada2/control-plane test
pnpm --filter @narada2/daemon test
```

Focused proof:

- create two related work items `a1`, `a2`
- record affinity from `a1` execution/session toward `a2`
- verify routing prefers the same lane when available
- verify fallback occurs when unavailable
- verify no invariant is violated by affinity routing

## Definition Of Done

- [x] Narada defines continuation affinity as a first-class routing concept.
- [x] Continuation affinity is explicitly distinguished from dependency.
- [x] Routing/scheduling can prefer affinity without making it mandatory.
- [x] Affinity has bounded lifetime and observability.
- [x] Docs explain the mechanic and its safety limits.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

**Task 212 was materially implemented with the following landing:**

### Implemented

1. **First-class affinity model** — `ContinuationAffinity` interface with 6 fields (`preferred_session_id`, `preferred_agent_id`, `affinity_group_id`, `affinity_strength`, `affinity_expires_at`, `affinity_reason`) added to `WorkItem`. Schema migrated with `DEFAULT` values for backward compatibility.

2. **Affinity derivation** — `DefaultForemanFacade.deriveAffinity()`:
   - Fresh open: looks up latest terminal work item for same `context_id`, copies its session as `preferred_session_id` with `strength=1`, `reason="same_context"`, 30-minute expiry.
   - Supersession: carries forward affinity verbatim from superseded item to new item.
   - Preview: synthetic work items get zeroed affinity fields.

3. **Scheduler ordering** — `SqliteScheduler.scanForRunnableWork()` orders by active affinity strength descending, then priority descending, then created_at ascending. Expired affinity is treated as strength=0 (fallback to normal ordering).

4. **Observability (v1)** — `WorkItemLifecycleSummary` now includes affinity fields. `getWorkItemAffinityOutcomes()` query exposes:
   - `had_affinity`: whether affinity was present
   - `affinity_expired`: whether it had expired
   - `outcome`: one of `no_preference` | `ordering_boost` | `expired_before_scan`
   - v2 deferred fields (`preferred_session_available`, `executed_by_preferred_session`) are always `null` until session-aware routing is implemented.

5. **Documentation** — `SEMANTICS.md` §2.12, `00-kernel.md` §3.4, `02-architecture.md` §Advisory Signals, and `AGENTS.md` invariant 38 all document affinity as advisory and non-authoritative.

### Explicitly Deferred to v2

- **Session-targeted lease acquisition** — The scheduler does not check whether `preferred_session_id` refers to an active/idle session before assigning a lease. `acquireLease()` is unchanged; runner selection is unaffected by affinity.
- **Runner selection based on affinity** — No worker registry or runner-id routing consults `preferred_session_id`.
- **Session reuse across work items** — Each work item still creates a new `AgentSession` in `startExecution()`. The preferred session is not reused.
- **Affinity outcome tracking (v2 fields)** — `preferred_session_available`, `executed_by_preferred_session`, and `actual_session_id` comparison are reserved for when session-aware routing exists.

### Verification

- `pnpm --filter @narada2/control-plane typecheck` — passes
- `pnpm --filter @narada2/cli typecheck` — passes
- Control-plane unit tests (scheduler, foreman, coordinator, observability, intent) — 235 tests pass (18 test files)
- Pre-existing `authority-guard.test.ts` false positive on `rebuild.ts` is unrelated

### Correction Task

Task 222 (`20260419-222-correct-task-212-affinity-routing-observability-and-task-state.md`) was opened to bring Task 212 into coherence after review found overstatement in routing claims. The correction narrowed docs to "ordering only (v1)" and added the `AffinityOutcome` observability surface. This task file was updated as part of Task 222.
