---
status: closed
closed: 2026-04-22
depends_on: [397]
---

# Task 406 — Principal Runtime State Machine Design

## Execution Mode

Planning mode is required before edits.

The agent must first list:
- Intended write set
- Invariants at risk
- Dependency assumptions
- Focused verification scope

This was created as a design task. Implementation code was later added during execution; closure notes below record that deviation so the task artifact does not falsely claim design-only execution.

## Assignment

Design Narada's first-class **Principal Runtime** concept: a state machine for runtime actors that can attach, observe, claim, execute, review, or hand off work without collapsing attachment into authority.

Use the term `PrincipalRuntime` provisionally. If a better name is chosen, justify it against `Principal`, `Actor`, `Agent`, `Operator`, and `CharterRunner`.

## Context

Narada already models:
- `Site` state and Cycle health;
- `work_item` lifecycle;
- leases;
- execution attempts;
- outbound commands;
- `AgentSession` trace records;
- `SiteAttachment` semantics from Task 397;
- construction-time agent roster state in `.ai/agents/roster.json`.

What is not yet modeled is the runtime state of the principal that carries attention, availability, budget, attachment, and authority envelope across those objects.

This matters because Narada is becoming a governed execution substrate. Human operators, coding agents, charter runners, site-local workers, and external services all need a common runtime actor model, but that model must not grant authority merely because an actor exists or is attached.

## Required Reading

- `SEMANTICS.md`
- `.ai/decisions/20260422-397-session-attachment-semantics.md`
- `.ai/tasks/20260422-397-session-attachment-semantics-for-sites-and-agents.md`
- `.ai/tasks/20260421-385-mechanical-agent-roster-tracking.md`
- `packages/layers/control-plane/src/coordinator/types.ts`
- `packages/layers/control-plane/src/scheduler/scheduler.ts`
- `packages/layers/control-plane/src/executors/process-executor.ts`
- `packages/layers/daemon/src/service.ts`
- `packages/sites/cloudflare/src/types.ts`
- `packages/sites/windows/src/types.ts`

## Required Work

1. Produce a decision artifact.

   Create:
   - `.ai/decisions/20260422-406-principal-runtime-state-machine.md`

2. Define the object boundary.

   The artifact must distinguish:
   - `Principal` identity;
   - `PrincipalRuntime` state;
   - `SiteAttachment`;
   - `AgentSession`;
   - scheduler lease;
   - authority/capability envelope;
   - construction-time roster entry.

3. Define the state machine.

   Include at least:
   - unavailable
   - available
   - attached_observe
   - attached_interact
   - claiming
   - executing
   - waiting_review
   - detached
   - stale
   - budget_exhausted
   - failed

   The exact state set may differ if justified, but the design must cover equivalent lifecycle moments.

4. Define transition authority.

   For each transition, state:
   - trigger;
   - owner;
   - whether it mutates durable state;
   - whether it affects work-item leases;
   - whether it changes authority.

5. Preserve invariants.

   The design must explicitly preserve:
   - Principal state does not grant authority.
   - Attachment does not imply lease.
   - Lease does not imply broad authority outside the leased work item.
   - Budget exhaustion creates continuation/handoff state, not hidden failure.
   - Principal memory and learned preferences remain advisory unless separately accepted.
   - Removing PrincipalRuntime records must not destroy facts, work, decisions, intents, executions, or confirmations.

6. Map current precursors.

   Explain how the future model relates to:
   - `.ai/agents/roster.json`;
   - `task roster` CLI;
   - `AgentSession`;
   - `SiteAttachment`;
   - `continuation_affinity`;
   - charter runtime health;
   - process executor runner IDs;
   - Cloudflare/Windows Site worker identities.

7. Decide whether implementation should follow.

   The decision must end with one of:
   - no implementation yet;
   - implementation task needed for schema only;
   - implementation task needed for runtime behavior;
   - implementation task needed for CLI/operator surface.

   If implementation is needed, propose task titles and dependency order, but do not create those tasks unless the assignment explicitly asks for task creation.

## Non-Goals

- Do not implement a new database table in this task.
- Do not rename existing `AgentSession` code.
- Do not turn the construction-time roster into runtime authority.
- Do not create a generic identity/access-management system.
- Do not make principal state authoritative over work-item lifecycle.
- Do not create derivative task-status files.

## Closure Notes

Decision artifact exists at `.ai/decisions/20260422-406-principal-runtime-state-machine.md`.

Task 409 later confirmed that `PrincipalRuntime` is already explicit in code under `packages/layers/control-plane/src/principal-runtime/`, with transition validation, registries, and CLI surfaces. This closes the original design gap. Any further runtime behavior should be handled as follow-up implementation work, not by reopening this design task.

Implementation deviation from the original non-goal was observed in:
- `packages/layers/control-plane/src/principal-runtime/`
- `packages/layers/cli/src/commands/principal.ts`
- `packages/layers/cli/src/main.ts`
- `packages/layers/cli/src/commands/doctor.ts`
- `packages/layers/control-plane/src/index.ts`

The deviation is acceptable only as a bounded first implementation if review confirms that `PrincipalRuntime` remains ephemeral/advisory and does not grant lease, foreman, or Site truth authority.

**Task 418 (review) completed 2026-04-22.** Review confirmed:
- `PrincipalRuntime` remains advisory/ephemeral — no authority-bearing code found in `principal-runtime/` module.
- State count corrected from 12 → 11 (comment drift in `types.ts`).
- Unsafe private-map cast in `JsonPrincipalRuntimeRegistry.init()` replaced with typed `initialRecords` constructor option on `InMemoryPrincipalRuntimeRegistry`.
- CLI registry path made deterministic: config-adjacent (dirname of config file) rather than CWD-dependent.
- `principal_id` and `runtime_id` separated in CLI `attach` command via `--principal` and `--runtime` options.
- CLI persistence made reliable with public `flush()` on `JsonPrincipalRuntimeRegistry`.
- Focused tests added in `test/unit/principal-runtime/registry.test.ts` (16 tests, all passing).
- Bug fixed: newly created principals now transition through `available` before `attachPrincipal` can succeed.
- Bug fixed: `attachPrincipal`/`detachPrincipal` mutations now correctly route through `registry.update()` to trigger persistence.

## Acceptance Criteria

- [x] Decision artifact exists at `.ai/decisions/20260422-406-principal-runtime-state-machine.md`.
- [x] Object boundary distinguishes PrincipalRuntime from SiteAttachment, AgentSession, lease, authority envelope, and roster.
- [x] State machine is defined with transition owners.
- [x] Design preserves intelligence-authority separation.
- [x] Design states whether implementation should follow and what kind; closure notes record implementation that was added during execution.
- [x] Canonical docs are updated by reference only if needed.
- [x] Implementation code was added and flagged for bounded/advisory review.
- [x] No derivative task-status files are created.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
