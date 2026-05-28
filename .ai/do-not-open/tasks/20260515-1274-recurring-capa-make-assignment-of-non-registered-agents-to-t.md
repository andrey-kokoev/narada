---
status: closed
closed_at: 2026-05-15T19:19:16.887Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Recurring CAPA: Make assignment of non-registered agents to tasks impossible

## Chapter

Canonical Inbox Promotions

## Goal

Operator identified a recurrence risk: tasks or work references can be assigned/probed against non-registered agent identities such as narada.claude-code and narada.native, allowing carrier/runtime labels to be confused with roster principals. Narada should make assignment of non-registered agents to tasks impossible at admission/assignment time, not merely fail later at work-next resolution.

## Context

Source inbox envelope: env_d60d85cc-ce6f-44ad-bb3d-b1b1ac480040

Source: user_chat:codex_session:operator_requested_recurring_capa_non_registered_agent_assignment_2026-05-15

Envelope kind: observation

Summary: Operator identified a recurrence risk: tasks or work references can be assigned/probed against non-registered agent identities such as narada.claude-code and narada.native, allowing carrier/runtime labels to be confused with roster principals. Narada should make assignment of non-registered agents to tasks impossible at admission/assignment time, not merely fail later at work-next resolution.

Evidence:
- Operator asked: record recurring capa: Make assignment of non registered agents to tasks impossible.
- Prior work-next probes for narada.claude-code and narada.native returned agent_not_in_roster, showing the resolver treats role-shaped addresses as candidate agent identities even when no active roster entry exists.
- The same discussion established that claude-code and native are carrier/runtime categories by default, not agent identities, absent explicit governed roster admission.
- Failure mode: a task, handoff, or assignment can encode an unregistered identity-like target and only surface as invalid when a carrier/agent tries to discover work.

Proposal:
- Corrective action: audit the assignment/admission path that allowed or suggested non-registered agent targets and identify any existing tasks/envelopes carrying non-roster agent identities.
- Preventive action: require assignment targets to resolve to active roster agents before task assignment, promotion, or work routing is accepted.
- Preventive action: distinguish carrier/runtime types from agent identities in validation errors and repair hints so runtime labels are not presented as roster roles by default.
- Verification: attempting to assign/promote work to an unregistered agent identity must fail at the assignment boundary with a durable rejection/admission record; registered agents such as narada.builder must continue to resolve normally.

Recommendation: Admit as recurring CAPA candidate and route to Architect for assignment-boundary validation hardening.

## Required Work

0. Source summary: Operator identified a recurrence risk: tasks or work references can be assigned/probed against non-registered agent identities such as narada.claude-code and narada.native, allowing carrier/runtime labels to be confused with roster principals. Narada should make assignment of non-registered agents to tasks impossible at admission/assignment time, not merely fail later at work-next resolution.
1. Read source inbox envelope env_d60d85cc-ce6f-44ad-bb3d-b1b1ac480040 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Audited the inbox task promotion and architect-process assignment path. `resolveAssignableAgent` in `packages/layers/cli/src/commands/inbox.ts` now requires assignment targets to resolve through the active roster before task creation or promotion proceeds.
- Confirmed non-roster assignment targets return `agent_not_in_roster` or `agent_address_ambiguous` with `no_workaround` guidance, rather than auto-creating a task or roster identity.
- Confirmed carrier/runtime-shaped labels such as `narada.claude-code` and `narada.native` receive an explicit carrier/runtime warning stating that carrier type is not task assignment authority.
- Confirmed valid roster assignments such as `builder` still create and claim tasks successfully through inbox promotion.
- Confirmed `work-next` agent address resolution fails closed for non-roster agents, role-shaped addresses with no active roster match, and ambiguous role-shaped addresses, while resolving exact-one site-qualified role addresses to concrete roster agents.

## Verification

- `pnpm --filter @narada2/cli test -- work-next.test.ts` passed as part of `pnpm --filter @narada2/cli test -- inbox.test.ts work-next.test.ts`; `work-next.test.ts` ran 29 passing tests.
- `$env:NARADA_GIT_BINARY='git'; pnpm --filter @narada2/cli test -- inbox.test.ts -t "non-roster|carrier labels|assigned tasks directly"` passed with 3 focused inbox assignment tests.
- The broader `inbox.test.ts` run still has unrelated Windows test-environment failures: several tests default to `/usr/bin/git`, and two assertions expect POSIX `.ai/mutation-evidence/inbox/` separators while Windows returns backslashes. Those are residual test-portability issues, not failures of the non-roster assignment boundary.

## Acceptance Criteria

- [x] Proposal handled: Corrective action: audit the assignment/admission path that allowed or suggested non-registered agent targets and identify any existing tasks/envelopes carrying non-roster agent identities.
- [x] Proposal handled: Preventive action: require assignment targets to resolve to active roster agents before task assignment, promotion, or work routing is accepted.
- [x] Proposal handled: Preventive action: distinguish carrier/runtime types from agent identities in validation errors and repair hints so runtime labels are not presented as roster roles by default.
- [x] Proposal handled: Verification: attempting to assign/promote work to an unregistered agent identity must fail at the assignment boundary with a durable rejection/admission record; registered agents such as narada.builder must continue to resolve normally.
- [x] Recommendation addressed or explicitly rejected: Admit as recurring CAPA candidate and route to Architect for assignment-boundary validation hardening.
