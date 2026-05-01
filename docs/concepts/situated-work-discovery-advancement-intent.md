# Situated Work Discovery And Advancement Intent

`situated_work_discovery_and_advancement` is the controlled intent path for ordinary Operator nudges such as:

- `where are we?`
- `what next?`
- `next`
- `continue`
- `go on`
- `builder is done`
- `process tasks`
- `check inbox`

The intent exists to make these utterances useful without turning them into magic phrases or autonomous action. It starts in the Intent Interpretation Zone, produces an inert candidate, then crosses Intent Admission only if the current Site, role, lifecycle state, and authority posture allow it.

## Role Duty Loop Nudge

`next` is the compact Operator nudge for a role to perform its normal duty loop. It is not a new authority grant and does not override target locus, role boundary, lifecycle, capability, verification, or publication rules.

Every admitted role interprets `next` through its own role contract:

- Architect inspects inbox, work-next, workboard, handoffs, coherence posture, and publication state; then routes, specifies, reviews, commits, or pushes only when those actions are Architect-admissible.
- Builder inspects claimed or assignable Builder work; then implements, verifies, reports, and hands off only through the governed task path.
- Observer performs the read-only observation loop; then reports findings or submits bounded observations, proposals, or appeals without mutating implementation or admitting work.
- Resident advances ordinary Site value production; then routes friction, effects, or construction needs through the proper governed surfaces.

If the normal duty loop discovers work outside the current role, the role must hand it off or submit an observation rather than silently changing roles.

## Topology

```text
Operator nudge / role handoff / inbox envelope / MCP call
  -> Intent Interpretation Zone
  -> situated_work_discovery_and_advancement candidate
  -> Intent Admission Zone
  -> bounded work-surface check
  -> admitted next action | answer | clarification | refusal | deferral | handoff
```

Interpretation recognizes that the Operator is asking for situated advancement. Admission decides whether advancement is allowed and what form it may take.

## Interpretation Inputs

The interpreter may consider:

- literal utterance or envelope text;
- current Site and authority locus;
- current role: Architect, Builder, Resident, or Operator;
- session or Operator Surface binding if declared;
- active task, chapter, inbox envelope, handoff, or review context;
- recent commits and dirty worktree posture;
- verification posture and residuals;
- active Operator prohibitions or constraints;
- role-specific bootstrap contract and handoff obligations.

The output is an inert candidate:

```json
{
  "candidate_kind": "situated_work_discovery_and_advancement",
  "source_ref": "operator-chat:continue",
  "role_context": "builder",
  "target_locus": "narada-proper",
  "confidence": "medium",
  "ambiguity": ["current task may be closed", "inbox may have higher-priority work"],
  "proposed_checks": ["workboard", "lifecycle_status", "inbox_work_next", "git_status"],
  "non_execution_note": "candidate does not claim, close, publish, or execute"
}
```

## Admission Checks

Admission must inspect bounded surfaces before selecting any next action:

| Surface | Required question |
| --- | --- |
| Site | What is the declared target locus and governing law source? |
| Role | Which role is inhabited and what actions may it admit? |
| Session | Is there an active task/session binding or only a vague continuation request? |
| Task lifecycle | Is there claimed, in-review, opened, blocked, deferred, closed, or confirmed work? |
| Chapter | Is there an active chapter arc or only unrelated open tasks? |
| Inbox | Are there received or claimed envelopes relevant to this role? |
| Handoff | Is Builder or Architect waiting for report, review, or handoff artifact? |
| Verification | Has required TIZ/CEIZ verification passed or is it missing/stale? |
| Qualification | Is this principal qualified for the governed work class, or is requalification required? |
| Residuals | Are blockers or field conditions already recorded? |
| Worktree | Are there uncommitted source/governance changes, and are they role-partitioned? |
| Authority posture | Would the next step mutate task, inbox, publication, external effects, or capabilities? |

Suggested read-only checks include:

```bash
narada task workboard --format json
narada task lifecycle status --format json
narada task work-next --agent <role-principal> --format json
narada inbox work-next --by <principal> --peek --format json
git status --short --branch
```

Only the admitted downstream command may mutate. The discovery intent itself is read-only.

## Role Checklists

### Architect

Architect uses this intent to find specification, review, routing, inbox, and coherence work.

Checklist:

- Inspect current task/chapter/inbox/workboard posture.
- Prefer review or admission work before creating new construction.
- If an inbox envelope is actionable, route it through `inbox architect-process`, `inbox pending`, or task creation only when the locus is correct.
- If Builder output is done, review evidence or request a bounded handoff artifact.
- If no governed action is available, answer the Operator with status and the exact blocker.

Architect must not become Builder merely because implementation work is visible.

### Builder

Builder uses this intent to continue or complete admitted construction work.

Checklist:

- Inspect current claimed task and Builder done posture.
- If the current task is claimed and incomplete, continue the task.
- If implementation is complete but evidence is missing, run admitted verification and report.
- If work is in review, do not self-admit unless the configured task path explicitly allows it.
- If no task is claimed, use `task work-next` or `task pull-next` only when the Operator or active task loop admits claiming.
- If source changes are dirty but unreported, report changed files, verification, residuals, and blockers before moving on.

Builder must not redesign the task, widen doctrine, or create new tasks merely because it found more work.

### Resident

Resident uses this intent to advance ordinary Site value production and surface friction.

Checklist:

- Determine whether the nudge concerns ordinary use-work, a construction change, or a mechanical effect.
- If ordinary use-work is bounded, proceed through Site-local use surfaces.
- If friction or missing capability appears, submit an inbox observation or route to Architect.
- If implementation is needed and already coherent, request Builder through the governed task path.
- If an external effect is requested, confirm the effect capability and intent path before execution.

Resident must not mutate Site governance or execute effects by convenience.

## Agent Work Duty Loop State

`next` is interpreted through an explicit agent work state, not remembered chat convention:

| State | Meaning |
| --- | --- |
| `unbound` | The role identity or Operator Surface binding is not addressable enough for directed work. |
| `idle` | No active task, law receipt, review handoff, or blocker is pending. |
| `has_active_task` | The agent has claimed/admitted work and should continue it before asking for new work. |
| `needs_status_report` | Local dirty state or completed-looking work needs report/evidence before new assignment. |
| `in_review` | Work is awaiting review/admission/closure rather than further Builder execution. |
| `blocked` | Law receipt, capability, dependency, or authority posture blocks ordinary work. |
| `done` | The agent has just completed work and should hand off/report before new assignment. |
| `handoff_needed` | Another role must review, admit, route, or execute before progress continues. |

Role-loop, work-next, roster, and Operator Surface status should report this state or a compatible projection so Operator nudges produce deterministic next action.

Qualification blockers follow [Site Qualification Policy](../product/site-qualification-policy.md). They should block only the affected governed work class; they should not prevent read-only inspection, status reporting, or submission of a bounded observation about the missing qualification.

## Admitted Outcomes

Allowed outcomes are:

| Outcome | When allowed |
| --- | --- |
| `answer_status_only` | Operator asked where things stand and no mutation is required. |
| `review_builder_output` | Work is in review or Builder reports completion with evidence. |
| `process_assigned_task` | The role has a claimed/admitted task and no stop rule blocks execution. |
| `discover_next_task` | Read-only next-work inspection is enough. |
| `claim_next_task` | The task loop or Operator admits mutation and dependencies allow it. |
| `process_inbox` | Inbox envelope is relevant and the role has intake/routing authority. |
| `submit_observation` | Friction should be preserved without immediate task pressure. |
| `ask_clarification` | Target locus, role, or requested outcome is ambiguous. |
| `refuse_or_defer` | Constraint, capability, destructive risk, or authority posture blocks action. |
| `handoff_for_review` | Another role must admit, review, or execute before progress. |

No outcome may skip the target zone's normal command surface.

## Stop Rules

Stop or ask clarification when:

- the target Site/locus is unclear;
- the Operator has an active prohibition that would be crossed;
- the next step would execute an external effect without capability admission;
- the next step would mutate task/inbox/publication state without a sanctioned command;
- role identity is ambiguous or would require changing roles;
- source changes are dirty and cannot be partitioned from the intended governance action;
- verification or review is required before closure;
- the only available work is blocked, deferred, or outside the current role.

## Relationship To Existing Surfaces

| Surface | Role in this intent |
| --- | --- |
| [`intent-interpretation-admission-zones.md`](intent-interpretation-admission-zones.md) | Defines the generic interpretation/admission topology. |
| [`canonical-inbox.md`](canonical-inbox.md) | Handles received observations and task candidates. |
| `narada task workboard` | Bounded current work, review handoff, inbox, and concurrency posture. |
| `narada task lifecycle status` | Allocation, lifecycle drift, snapshot evidence, and Builder done posture. |
| `narada task handoff` | Bounded review/execution handoff packet. |
| `narada task work-next` | Current/next task execution packet; may claim only when admitted. |
| MCP `narada_task_work_next` | Agent-facing facade over the same task work-next semantics. |
| CEIZ/TIZ | Command and verification execution after admission. |

## First Machinery Slice

The first implementation slice should be read-only:

- define a `situated_work_discovery_and_advancement` candidate type;
- map common phrases to the candidate with role and target-locus ambiguity preserved;
- run bounded posture checks through `task workboard`, `task lifecycle status`, `task work-next` in read-only mode, inbox peek, and git status;
- return an admission recommendation with the exact downstream command, if any;
- prove that interpretation alone does not claim, close, publish, execute, or submit effects.

Mutation can be added only by delegating to existing sanctioned commands after admission.
