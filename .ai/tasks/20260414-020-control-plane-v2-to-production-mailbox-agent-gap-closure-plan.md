# Control Plane v2 to Production Mailbox Agent — Gap Closure Plan

## Mission

Define the remaining work required to turn Narada’s newly implemented control-plane v2 substrate into the production mailbox agent system we actually want.

This is a planning and sequencing task. It is not an implementation task.

## Current Assessment

Narada now has a real control-plane substrate:

- durable coordinator state for conversations, revisions, work items, leases, execution attempts, evaluations, and tool call records exists in `SqliteCoordinatorStore` :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1}
- a real scheduler exists for runnable work scanning, lease acquisition, execution lifecycle, retry, and stale lease recovery :contentReference[oaicite:2]{index=2}
- a real foreman exists for work opening, supersession, evaluation validation, and outbound handoff :contentReference[oaicite:3]{index=3} :contentReference[oaicite:4]{index=4}
- the daemon now performs a dispatch phase after sync and drives foreman + scheduler + charter execution in-process :contentReference[oaicite:5]{index=5}
- the package exports now expose coordinator, foreman, scheduler, charter, and trace surfaces as first-class runtime modules :contentReference[oaicite:6]{index=6}

However, the current system is still not the terminal production mailbox agent:

- daemon dispatch still defaults to `MockCharterRunner` unless a real runner is injected :contentReference[oaicite:7]{index=7}
- the real Codex-capable charter runner is API-based, not CLI-based, and is not yet wired into the daemon dispatch path by default :contentReference[oaicite:8]{index=8}
- invocation envelopes still expose no actual runtime tools (`available_tools: []`) :contentReference[oaicite:9]{index=9}
- charter routing is still hardcoded around `support_steward` in core foreman/envelope flows :contentReference[oaicite:10]{index=10} :contentReference[oaicite:11]{index=11}
- multi-mailbox dispatch remains explicitly deferred in the daemon service :contentReference[oaicite:12]{index=12}
- identity remains partly transitional because v2 `conversation_id` objects coexist with legacy `thread_id` surfaces and migration logic :contentReference[oaicite:13]{index=13} :contentReference[oaicite:14]{index=14}

## Terminal Objective

Narada must become:

> a background mailbox operating substrate that continuously syncs mailbox state, opens durable work items for changed conversations, invokes a real bounded Codex-based charter runtime with governed tools and mailbox-specific policy, and materializes approved side effects only through the outbound worker, with crash-safe re-entry and no hidden in-memory authority.

## Planning Goal

Produce the normative phase plan from the current implemented substrate to the terminal objective.

The result must answer:

1. What is already solved well enough to build upon?
2. What remains missing?
3. What must happen first?
4. What can be deferred?
5. What are the exact success conditions for each phase?

## Core Invariants

1. Remote mailbox truth remains outside Narada.
2. `exchange-fs-sync` remains the deterministic compiler of mailbox state.
3. The control plane remains driven by durable work items, not traces or chat history.
4. Outbound worker remains the sole authority over mailbox mutations.
5. Agent runtime remains bounded and re-entrant.
6. Commentary, traces, and reasoning logs must never become correctness state.

## Required Work

### Task 1 — Define the Production Runtime Decision

Produce a decision section that resolves the runtime path for charter execution:

- Codex/OpenAI-compatible API runner
- Codex CLI runner in local workspace
- dual runtime abstraction with configurable backend

You must answer:

- which runtime is the production default
- which runtime is optional/dev-only
- what tradeoffs matter for Narada specifically
- what effect this choice has on tools, workspace context, secrets, and observability

### Task 2 — Define the Remaining Gap Categories

You must classify remaining work into explicit gap buckets.

At minimum include:

- real charter runtime wiring
- mailbox charter/policy routing
- live tool governance
- identity cleanup
- arbitration refinement
- replay/crash/e2e test harness
- multi-mailbox dispatch completion
- documentation realignment

For each gap:
- describe the current state
- describe the target state
- explain why it blocks or does not block the terminal objective

### Task 3 — Produce the Phase Plan

Define exactly three phases:

### Phase A — Make It Real
Convert the scaffold into a real working mailbox-agent path.

### Phase B — Make It Safe
Close semantic, replay, crash, and arbitration ambiguity.

### Phase C — Make It General
Lift the system from one-mailbox/v1 assumptions to a reusable Narada platform.

For each phase, define:
- included workstreams
- excluded workstreams
- dependencies
- success criteria
- explicit exit condition

### Task 4 — Define Ordering Constraints

State which remaining work must be sequential and which may proceed in parallel.

At minimum answer:
- can real runtime wiring happen before identity cleanup
- can tool governance happen before routing cleanup
- can multi-mailbox dispatch happen before the single-mailbox runtime is real
- can docs lag implementation during this phase, or must they stay synchronized

### Task 5 — Define the Critical Path

Produce the shortest path that still preserves de-arbitrarization.

This is not the same as the shortest implementation path.

You must identify:
- the one or two highest-leverage next artifacts
- the work that would create the most rework if done prematurely
- the work that is safe to defer

### Task 6 — Define Success Metrics

For each phase, define concrete evidence that the repo has advanced.

Examples to consider:
- daemon uses a real runtime by default
- at least one mailbox can flow end-to-end from sync to outbound command creation using a real charter runtime
- work replay after crash is demonstrated in tests
- tool calls are governed and durably recorded
- multi-mailbox dispatch is no longer deferred

Use repo- and runtime-specific success signals, not generic project-management language.

## Required Output Format

### 1. Current State Summary
Concise but explicit summary of what is already implemented and what is still missing.

### 2. Gap Register
Table or bullet list with:
- gap
- current state
- target state
- priority
- blocking/non-blocking

### 3. Three-Phase Plan
Exactly:
- Phase A — Make It Real
- Phase B — Make It Safe
- Phase C — Make It General

For each phase:
- scope
- dependencies
- deliverables
- exit criteria

### 4. Critical Path
List the first tasks that should be executed next.

### 5. Deferred Work
Explicitly list what is intentionally not needed before the system becomes useful.

### 6. Terminal Readiness Statement
End with a short statement beginning with:

> “Narada reaches the terminal mailbox-agent objective when …”

## Constraints

Do not:
- write implementation code
- redesign the whole architecture from scratch
- reopen already-settled control-plane foundations without a concrete contradiction
- optimize for speculative analytics or observability products
- treat traces as the primary remaining axis of work

## Definition of Done

- [ ] Current implemented substrate is accurately summarized
- [ ] Remaining gaps are explicitly categorized
- [ ] The plan is organized into three phases
- [ ] Ordering constraints are explicit
- [ ] Critical path is explicit
- [ ] Exit criteria are concrete enough to drive follow-on tasks
