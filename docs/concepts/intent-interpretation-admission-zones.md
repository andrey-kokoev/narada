# Intent Interpretation And Admission Zones

Narada separates natural-language intent interpretation from authority-bearing intent admission.

This exists because short Operator or Architect utterances such as `continue`, `go on`, `process tasks`, or `check inbox` should not require magic phrasing, but they also must not become arbitrary execution.

## Topology

```text
utterance / envelope / UI event / MCP call
  -> Intent Interpretation Zone
  -> Intent Candidate
  -> Intent Admission Zone
  -> admitted path | clarification | refusal | deferral | handoff
```

The first zone interprets possible meaning. The second zone decides whether anything may become consequential.

## Intent Interpretation Zone

The Intent Interpretation Zone receives ambiguous or semi-structured pressure and produces inert candidates.

Inputs may include:

- Operator chat utterances;
- Architect or Builder handoff text;
- inbox envelopes without an already typed target;
- CLI, MCP, UI, or file-drop requests that contain natural-language intent;
- schedule or daemon triggers that need policy interpretation before action.

Its output is an `IntentCandidate`:

| Field | Meaning |
| --- | --- |
| `candidate_id` | Durable or transient candidate identity. |
| `source_kind` / `source_ref` | Where the pressure came from. |
| `proposed_path` | Controlled admitted-path enum value, not free execution text. |
| `target_locus` | Intended Site/task/inbox/chapter/command/evidence locus if known. |
| `role_context` | Operator, Architect, Builder, Resident, or trace substrate context. |
| `confidence` | Interpreter confidence in the proposed path. |
| `ambiguity` | Missing facts, competing readings, or stop-rule risks. |
| `evidence_refs` | Conversation, envelope, task, workboard, or trace evidence used. |
| `non_execution_note` | Explicit statement that interpretation does not execute or admit. |

Interpretation may rank candidates, ask a clarifying question, or produce no candidate. It must not mutate task state, claim work, execute commands, close reviews, publish, or submit effects merely because it found a likely meaning.

## Intent Admission Zone

The Intent Admission Zone receives typed candidates and decides disposition under the target authority.

Inputs may come from chat interpretation, Canonical Inbox, CLI, MCP, UI, file-drop, schedule, or a previous governed crossing.

Admission checks include:

- target authority locus and embodiment freshness;
- role posture and allowed role actions;
- task/chapter lifecycle state;
- stop rules, Operator prohibitions, and active constraints;
- capability and secret authority;
- command/test/output-admission risk;
- dirty worktree and concurrent-role partitioning;
- review, handoff, and evidence requirements;
- whether the candidate is read-only, local mutation, external effect, or destructive.

Admission outcomes are explicit:

| Outcome | Meaning |
| --- | --- |
| `admitted` | Candidate may cross into the target path. |
| `clarification_required` | Ask exactly the missing high-entropy question. |
| `refused` | Guardrail, authority, capability, or freshness rule blocks it. |
| `deferred` | Valid candidate but not executable now. |
| `routed` | Send to another Site, inbox, task, reviewer, or capability authority. |
| `handoff_required` | Builder/Architect/Operator review or execution handoff is needed. |
| `recorded_residual` | Preserve the pressure without acting. |

Admission is the earliest point where consequence may begin, and only for the admitted path.

## Controlled Admitted Paths

The initial controlled set is:

| Path | Meaning |
| --- | --- |
| `continue_current_task` | Continue the currently claimed task for the admitted agent. |
| `discover_next_task` | Inspect next admissible work without claiming it. |
| `process_assigned_tasks` | Run the governed task loop for assigned/admissible tasks. |
| `review_completed_work` | Review in-review work and admit/reject closure. |
| `submit_observation` | Submit an inert inbox observation. |
| `repair_local_system` | Execute a bounded local repair path after authority and risk checks. |
| `answer_question_only` | Respond without mutation. |
| `ask_clarifying_question` | Stop for missing authority or ambiguity. |
| `refuse_due_to_guardrail` | Explain the blocking rule and no-op. |
| `handoff_for_review` | Produce a bounded review handoff artifact. |

New admitted paths require doctrine or command support first. Free-form strings are not admitted paths.

## Role Inhabitation Entry Protocol

When a fresh Builder receives a vague continuation request, the correct path is:

1. Interpret the utterance into likely candidates such as `continue_current_task`, `discover_next_task`, or `process_assigned_tasks`.
2. Inspect bounded state through `narada task workboard`, `narada task work-next --agent <id>`, or MCP `narada_task_work_next`.
3. Apply stop rules: target locus, active Operator constraints, role posture, lifecycle state, dirty-work partition, and capability risk.
4. Admit the next path only if it is governed and local.
5. If admitted, execute through task lifecycle, TIZ/CEIZ, inbox, or publication surfaces as appropriate.
6. Record evidence, report residuals, and leave a review handoff when admission is expected.

Architect follows the same topology but normally admits only specification, routing, assignment, review, observation, or handoff paths. Architect does not become Builder because interpretation found implementation work.

Operator input may authorize or override, but the override must still be represented at the relevant admission boundary.

## Relationship To Existing Zones

| Surface | Relationship |
| --- | --- |
| Canonical Inbox | Typed envelopes can enter directly at Intent Admission when kind, target, and authority are explicit. Ambiguous envelopes enter Interpretation first. |
| CEIZ | `repair_local_system` or command execution paths cross into CEIZ only after admission. |
| TIZ | Verification requests are admitted as test intent, then cross into CEIZ for execution and back into evidence admission. |
| MCP facade | MCP tools are typed facade calls. Read-only tools may bypass interpretation; mutating or ambiguous calls still require admission. |
| Task lifecycle | Task claim, report, review, close, handoff, and work-next are admission-governed lifecycle paths. |
| Role bootstrap | Fresh roles start by interpreting pressure, then admitting a controlled path; they do not rely on chat memory or magic phrases. |
| Inhabited Evolution | Repeated friction in interpretation/admission may lift into new paths only after the originating case runs through the lifted form. |

## First Machinery Slice

The first machinery slice should not make an autonomous interpreter.

It should provide:

- a small `IntentCandidate` type and controlled path enum;
- a read-only interpreter helper for common Operator utterances;
- an admission helper that consumes candidate, role, target locus, and current workboard state;
- tests proving vague phrases produce inert candidates and do not mutate;
- MCP/CLI surfaces that can expose candidate/admission results before execution.

Execution remains in task lifecycle, inbox, CEIZ, TIZ, publication, or other existing zones. Interpretation never executes.
