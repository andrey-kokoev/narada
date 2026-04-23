# Agent Task Execution Contract

This contract applies to Narada task execution unless a task explicitly overrides a rule.

It is paired with `.ai/task-contracts/question-escalation.md`. If a task becomes ambiguous at an authority, semantic, product, safety, private-data, or verification boundary, follow that escalation contract instead of making an arbitrary local decision.

## Artifact Discipline

- Update the original task file as the canonical record.
- Do not create derivative status files.
- Forbidden suffixes: `-EXECUTED.md`, `-DONE.md`, `-RESULT.md`, `-FINAL.md`, `-SUPERSEDED.md`.
- Put completion evidence in the original task under `Execution Notes`, `Verification`, or `Outcome`.
- If a task is obsolete, blocked, or superseded, mark that in the original task file.

## Task Number Allocation

- **Never allocate task numbers by inspecting `ls | tail` or similar filename-ordering heuristics.**
- Use the reservation/allocation protocol defined in `docs/governance/task-graph-evolution-boundary.md` §3.
- **Reserve ranges before creating batches or chapter DAGs** using `scripts/task-reserve.ts`:
  ```bash
  pnpm exec tsx scripts/task-reserve.ts --range START-END --purpose "..." --agent <name>
  ```
- If the reservation script does not exist yet, compute the next available number by scanning all `# Task NNN` headings in `.ai/tasks/*.md` (not by filename sorting) and record the reservation manually in `.ai/tasks/.registry.json`.
- If `.ai/tasks/.registry.json` exists, check it for active reservations and the `last_allocated` value before creating tasks.
- If a collision is detected (a task number already claimed by another file), **stop** and invoke the correction path:
  - Record the collision in `.ai/feedback/governance.md` or the affected task file.
  - If `scripts/task-renumber.ts` (Task 446) exists, use it to resolve the collision.
  - If no tooling exists yet, correct the collision explicitly by renumbering and patching all references.
- Do not create tasks inside an active reserved range belonging to another agent or chapter.

## Self-Standing Task Requirement

A task file must contain enough execution context for an agent to act from `execute <task-number>` alone.

Assignment messages are routing signals, not hidden specification carriers. If a task requires extra pasted instructions to be safely executed, the task file is incomplete and must be patched before or during assignment.

Each executable task should include, where applicable:

- **Read-first references**: governing docs, contracts, prior task artifacts, or chapter files the agent must inspect.
- **Scope**: what the task is responsible for and what it must not expand into.
- **Authority boundaries**: lifecycle, state-machine, side-effect, observation/control, or review boundaries at risk.
- **Non-goals**: especially live mutation, production-readiness, send/email, broad abstraction, or external-system access prohibitions.
- **Acceptance criteria**: concrete completion checks in the task file itself.
- **Focused verification**: the smallest useful test/check commands or a clear blocker-evidence standard.
- **Artifact discipline**: reminder not to create derivative task-status files when the task is likely to be executed by an external agent.

For dependency-heavy tasks, include explicit dependency assumptions and the "read first" contract links. For high-risk tasks, include the required execution mode in the task file itself.

Architect/operator assignment text should usually be only `execute N` or `review N`. If more is needed, first ask whether that content belongs in the task file.

## Safety

- Do not send email unless the task explicitly authorizes sending.
- Do not mutate live external systems unless the task explicitly authorizes the mutation.
- Do not commit secrets, credentials, tokens, private mailbox contents, or private operational data to the public repo.
- Prefer fixture-backed or mock-backed verification for live-operation work unless live access is explicitly required.

## Authority Boundaries

- Preserve Narada authority boundaries.
- Do not bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, `OutboundHandoff`, outbound workers, or observation/control separation.
- Charter runtimes must not mutate coordinator or outbound stores directly.
- Observation surfaces must remain read-only.

## Static Grammar vs Operator Boundary

Static grammar may define what a task, finding, roster entry, or chapter is. Operators perform transitions. No static package owns claim, release, allocate, close, execute, or confirm behavior.

- **Static schema**: artifact shape, grammar, validation rules.
- **Pure tool/compiler**: deterministic artifact transformation without lifecycle mutation.
- **Operator**: explicit state transition or mutation (claim, release, allocate, derive, close, confirm).
- **Observation**: read-only reporting over task-governance artifacts.

## Verification

- **Prefer the suggestion surface first.** Before deciding verification scope manually, run `narada verify suggest --files <changed-files>` to get the smallest plausible command.
- Use focused verification first.
- Do not run the full suite unless the task or user explicitly requests it.
- If verification cannot be run, record why in the original task file.
- If verification exposes an unrelated blocker, record it clearly rather than hiding or broadening the task.

## Tool Output Austerity

- Prefer the smallest probe that answers the current question.
- Do not dump large JSON payloads or multi-command transcripts unless exact machine fields are required.
- On the normal path, prefer terse human output or single-field checks over full structured output.
- Do not chain multiple bulky inspection commands into one tool call when one narrower probe will do.
- If exact structured state is required, fetch only the minimal command needed and summarize the result in chat rather than repeating the raw payload.
- Treat context budget as a governed resource. Oversized diagnostic output is a workflow defect, not neutral exhaust.

## Accepted Learning Recall

Accepted learning artifacts in `.ai/learning/accepted/` are **active guidance** only when surfaced by tool lookup at the point of action. They are not silently enforced and must not automatically mutate task, roster, assignment, report, review, or runtime state.

- Commands that surface guidance (`narada task roster`, `narada task report`, `narada task recommend`) display concise reminders/warnings but keep the command's primary output unobscured.
- Default human output is terse: the primary mutation/result is shown first, warnings are bounded to one line each, and multi-line accepted-learning guidance is suppressed.
- Use `--verbose` to surface expanded accepted-learning guidance and richer rationale on any command that supports it.
- JSON/machine output remains complete and unchanged; verbosity gating applies only to the default human path.
- Agents should **prefer tool-surfaced accepted learning** over private model memory. If a learning artifact exists for a command surface, rely on it rather than recalling the rule from chat history.
- Local/private model memories are **fallback only**, not Narada-authoritative. The canonical behavior constraint lives in the accepted artifact file.
- Learning artifacts may declare `scopes` (e.g., `roster`, `assignment`, `report`, `recommendation`, `review`, `task-governance`) to control where they are surfaced. Artifacts without scopes are not automatically recalled.

## Review and Closure Artifacts

Reviews and closures are durable governance artifacts that must be linked to the tasks they govern.

### Review Files

Review files live in `.ai/reviews/` and must use standardized front matter:

```yaml
---
review_of: 351
reviewer: agent-name
reviewed_at: 2026-04-21T00:00:00Z
verdict: accepted   # accepted | rejected | partial
---
```

- `review_of` is the task number being reviewed.
- `verdict` records the review outcome.
- Review is **separate** from report. A WorkResultReport signals readiness for review; the review file records the independent evaluation.

### Closure Decision Files

Closure decisions live in `.ai/decisions/` and should use standardized front matter when closing tasks:

```yaml
---
closes_tasks: [287, 296]
closed_at: 2026-04-20T00:00:00Z
closed_by: operator-name
---
```

- `closes_tasks` lists the task numbers being closed.
- Closure is a **governed promotion** from `closed` to `confirmed`, not an automatic transition.

### Validation

- `narada task lint` detects stale review references (review_of non-existent task) and orphan reviews (task in `in_review` with no review file).
- `narada task lint` detects stale closure references (closes_tasks references non-existent task) and orphan closures (task marked `closed` with no closure decision).
- `scripts/task-lifecycle-check.ts` validates deeper consistency: task status vs review verdict mismatches, confirmed tasks without closures, etc.

### Crossing Regime Review Checklist

When reviewing a task that introduces a new durable authority-changing boundary, the reviewer must verify:

1. **Has the crossing regime been declared?** The task should explicitly define:
   - `source_zone` — the zone providing the artifact
   - `destination_zone` — the zone receiving the artifact
   - `authority_owner` — who governs the crossing
   - `admissibility_regime` — what rules determine what may cross
   - `crossing_artifact` — the durable record produced
   - `confirmation_rule` — how the crossing is verified

2. **Does the declaration reference the canonical contract?** The task should reference `SEMANTICS.md §2.15` or `Task 495` to show awareness of the crossing regime concept.

3. **Is the crossing genuinely new?** If the task uses an existing canonical crossing (e.g., `Source → Fact`, `Decision → Intent`), no new declaration is required.

4. **Is the anti-collapse invariant stated?** Every new crossing should state what collapse it prevents.

If the task does NOT introduce a new durable authority-changing boundary, this checklist does not apply.

### Crossing Regime Construction Reminder

When **constructing** (not reviewing) a task, the author should:

- Check whether the task introduces a new durable authority-changing boundary.
- If yes, include a `## Crossing Regime` section with the six irreducible fields.
- If no, leave the section commented/omitted.
- The `narada chapter init` template includes an optional commented crossing regime section for this purpose.
- The construction loop plan warns when open tasks appear to lack crossing regime declarations.

## Governance Feedback

If you observe friction in the task-governed development system itself (ambiguous contracts, repeated acceptance criteria, hard-to-apply verification policy, task-DAG blocking, contract/implementation mismatch, or a better governing rule), append feedback to `.ai/feedback/governance.md` after completing the task.

Governance feedback is **not** escalation. Escalation means the task is blocked and needs a decision before proceeding. Governance feedback means the task was completed, but the experience revealed something that should improve the system for future work.

- If the issue blocks the task, use `## Escalation Needed` in the task file (see `.ai/task-contracts/question-escalation.md`).
- If the issue does not block the task, finish the task and add governance feedback separately.

## Self-Governance Boundary

Narada may perform certain governance actions autonomously within its build loop; others remain explicitly operator-owned. The boundary is governed by the action's authority class and the construction loop policy's `allowed_autonomy_level`.

### Self-Governed Actions

These actions may be performed without explicit operator approval, subject to policy:

- **Read-only observation**: `task recommend`, `task evidence`, `task evidence-list`, `task lint`, `task graph`, `task list`, `task roster show`, `construction-loop plan` (planning mode only)
- **Bounded auto-promotion**: `task promote-recommendation` / `task claim` when `allowed_autonomy_level = bounded_auto`, `require_operator_approval_for_promotion = false`, and all validation gates pass

### Operator-Owned Actions

These actions require explicit operator intent regardless of policy level:

- **Task creation and chapter selection** (`chapter init`, manual task authoring)
- **Live external execution** (`sync`, `cycle`, `console approve/reject`)
- **Unsafe promotion** (`promote-recommendation --override-risk`)
- **Commit authority** (`git commit`, `git push`)
- **Policy changes** (editing `.ai/construction-loop/policy.json`)
- **Authority boundary changes** (Foreman, Scheduler, IntentHandoff, OutboundHandoff)
- **Schema changes** (config, persistence, CLI public surface)
- **Terminal state transitions** (`task close`, `task finish`, `task review`, `task roster done --allow-incomplete`)
- **Reopen and derive** (`task reopen`, `task derive-from-finding`)

### Key Invariants

- `allowed_autonomy_level` never elevates an operator-owned action to self-governed.
- Self-governed actions are advisory by default; bounded auto-promotion is the sole exception.
- Policy changes are always operator-owned.

For the full contract, see `.ai/decisions/20260423-510-self-governance-boundary-contract.md`.

## Construction Loop Controller

The construction loop controller (`narada construction-loop plan`) is an advisory composition layer that automates mechanical observation and planning steps. It does not replace individual operators.

- It may **read** all task-governance artifacts.
- It may **not** mutate task files, roster, or assignment state.
- It produces a **plan** that the operator reviews before executing.
- All promotion, assignment, review, closure, and commit authority remains with the operator.

Agents should treat controller output as advisory. The operator may accept, modify, or reject the plan. Chat messages and controller plans are not authoritative over durable task state.

## Coherence Control Rules

These rules prevent task execution from becoming performative process.

- **Tasks are pressure intent, not pressure effect.** Creating, renumbering, or assigning a task does not satisfy the task. A task changes project posture only when executable artifacts, reviewed evidence, or explicit residuals are recorded.
- **Counterweight the deformation, not the surface activity.** If review feels overweighted, do not remove review by default; produce evidence that makes review load-bearing. If implementation feels too fast, do not stop coding by default; restore the missing invariant boundary.
- **Fixtures prove usefulness through invariants.** A fixture is not just a happy-path test. It must show that useful behavior passes through the claimed structure and does not bypass authority boundaries.
- **Residuals preserve coherence.** If a correction is not admissible, record a bounded residual instead of narrating around the blocker or patching locally.
- **Do not claim posture change without evidence.** A diagnosis, plan, or task graph may justify work, but completion requires verification or an explicit residual.

## Work Result Reports

When an agent believes a claimed task is ready for review, it must submit a **WorkResultReport** using `narada task report` instead of relying on chat as completion evidence.

An agent must not ask to be marked `done` until the appropriate durable evidence exists:

- **Implementer**: submit `narada task report <task-number> ...` and ensure the task has execution notes, verification notes, and checked acceptance criteria or explicit residuals.
- **Reviewer**: create a review artifact or run the review operator so `.ai/reviews/` records the independent verdict.
- **Continuation agent**: if continuing or taking over an already-claimed task, use `narada task continue <task-number> --agent <id> --reason <evidence_repair|review_fix|handoff|blocked_agent|operator_override>` to record continuation intent durably. Do not use chat-only handoff.
- **Operator handoff**: run `narada task evidence <task-number>` before `narada task roster done <task-number> --agent <id>`. Operators may also run `narada task evidence list` to see all tasks that are not complete by evidence before declaring a chapter or batch state.

`narada task roster done` blocks by default when this evidence is missing. Use `--allow-incomplete` only to record that the agent is available while explicitly preserving the task as incomplete.

**Preferred completion command:** `narada task finish <task-number> --agent <id>` is the canonical path for agent completion. It:
- Detects whether the current handoff is report-shaped or review-shaped from task state, existing artifacts, and explicit flags
- Submits or reuses a WorkResultReport or review artifact
- Runs evidence inspection
- Calls `task roster done` only when evidence is sufficient
- Returns a single structured result with report/review action, evidence verdict, and roster transition

Use `narada task finish` instead of chat-only "done" or separate `task report` + `task roster done` invocations.

### Report Requirements

- **Summary**: Human-readable description of what was done and why.
- **Changed files**: List of paths the agent modified.
- **Verification**: Focused verification commands and their results.
- **Known residuals**: Explicitly bounded gaps, blockers, or deferred items.

### Invariants

- A report is **evidence**, not authority. It does not close a task.
- A report does **not** prove correctness. It signals readiness for review.
- Chat summaries may mirror the report but are **not authoritative**.
- Review remains **separate** from reporting. A submitted report awaits independent review.

## Agent Roster as Assignment Source of Truth

The operational agent roster (`.ai/agents/roster.json`) is the canonical source of truth for which agent is currently working on which task.

### Operational Rules

- **Roster is inspectable**: `narada task roster` shows every agent's current status, task, last completed task, and update timestamp.
- **Roster is updateable**: `narada task roster assign/review/done/idle` mutate operational state without touching task lifecycle authority.
- **Roster updates are NOT lifecycle mutations**: `roster assign` does not claim a task. `roster done` does not release or close a task. Operators who need both must run the lifecycle command AND the roster command.
- **Done requires complete evidence by default**: `roster done` refuses to clear an agent from a task when the task is not complete by evidence. `--allow-incomplete` is the explicit escape hatch and means "agent available, task still incomplete."
- **Assignment recommendations must read the roster**: Before suggesting work to an agent, check the roster to see if the agent is already `working`, `reviewing`, or `blocked`.
- **Promotion is the preferred path from recommendation to assignment**: Use `narada task promote-recommendation --task <n> --agent <id> --by <operator>` to turn an advisory recommendation into a durable assignment. This validates current state, writes an audit record, and delegates mutation to `task claim`. Direct `task claim` is still available as the low-level primitive, but promotion adds governance scaffolding.
- **Recommended assignments are operative unless rejected**: When the architect/operator recommends a target assignment and the human operator does not disagree or correct it, treat the recommendation as assigned and immediately update the roster. Do not leave accepted recommendations as chat-only intent.
- **Chat updates should be translated into roster updates**: When an agent reports status in chat, the operator should run the corresponding `narada task roster` command to keep mechanical state in sync.
- **Conversation beats stale roster**: If conversational assignment state and roster state diverge, treat the conversation as the source of the correction and update the roster promptly. Then report the exact roster state from `narada task roster show`.

### Roster Race-Safety Invariant

- **Roster mutations are serialized**: All `narada task roster ...` mutations route through `withRosterMutation`, which acquires an exclusive file lock (`.ai/agents/roster.lock`) before reading, applies the mutation, writes atomically via temp-file rename, and releases the lock in `finally`.
- **Stale locks are recovered automatically**: If a lock is abandoned for more than 30 seconds, it is removed and the waiting mutation proceeds.
- **Do not edit `.ai/agents/roster.json` manually while CLI coordination is active**: Manual edits bypass the lock and can corrupt operational state.
- **Temp-file atomic write does not by itself solve read-modify-write races**: The lock is required because two processes can read the same file, compute mutations on stale copies, and overwrite each other's changes. Atomic rename only prevents partial writes, not lost updates.

### Roster Status Values

| Status | Meaning |
|--------|---------|
| `idle` | Agent has no current task assignment |
| `working` | Agent is actively executing a task |
| `reviewing` | Agent is reviewing another agent's completed work |
| `blocked` | Agent is stalled (waiting for dependency, clarification, or external action) |
| `done` | Agent just finished a task and has not yet been reassigned |

## Planning Mode

Planning mode is a risk-control mechanism, not a default ritual. Use it when the write set is large, semantically risky, or cross-cutting. Skip it for narrow corrections with an obvious write set.

### Required Planning Triggers

Start in planning mode before editing when any of the following are true:

- Task touches multiple packages
- Task changes authority boundaries (`ForemanFacade`, `Scheduler`, `IntentHandoff`, `OutboundHandoff`, observation/control separation)
- Task changes lifecycle states or state machines
- Task changes config schema, persistence schema, CLI public surface, or daemon behavior
- Task depends on another in-flight task or may conflict with another agent
- Task involves choosing between materially different designs

### Optional Planning

Planning mode is optional but recommended when:

- Task changes public types or APIs consumed by other packages
- Task adds new observation or control surfaces
- Task modifies test strategy or verification ladder

### Skip Planning

Proceed directly when:

- Artifact-only cleanup (task notes, stale comments, formatting)
- Focused review of another agent's work
- Test-count or documentation drift corrections
- Small CLI wiring or option plumbing
- Localized bug fix with an obvious write set (single file, single function)

### Minimum Plan Contents

If planning mode is required or optional, the plan must name:

1. **Intended write set** — which files will change and why
2. **Invariants at risk** — which authority boundaries, contracts, or invariants could be violated
3. **Dependency assumptions** — what must be true about other tasks, packages, or runtime state
4. **Focused verification scope** — which tests or checks will prove correctness (do not default to "run everything")

Use the agent environment's planning mode when the plan requires user approval before proceeding. Use a concise inline plan in the task file when the plan is straightforward and does not need explicit user sign-off.

## Execution Mode

Task creators may mark execution mode explicitly in the task body. Agents must respect the marked mode unless the task context clearly overrides it.

### Planning Mode Snippet

Use this in a task file when the task requires planning before edits:

```md
## Execution Mode

Start in planning mode before editing. The plan must name:
- intended write set
- invariants at risk
- dependency assumptions
- focused verification scope
```

### Direct Execution Snippet

Use this in a task file when the task is narrow and corrective:

```md
## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.
```

## Architectural Pruning Contract (PE-lite)

Architecture-heavy tasks and architecture-heavy closure reviews must follow the PE-lite contract in `docs/governance/architectural-pruning.md`. PE-lite is a review discipline, not a runtime law.

### When PE-lite Is Required

- The task refactors boundaries, layers, or state machines.
- The closure review touches multiple authority boundaries or cross-cutting concerns.
- The task's primary goal is simplification, consolidation, or removal of legacy structure.
- The review surfaces unexplained complexity in coupled loci (e.g., foreman + scheduler + outbound lifecycle).

### When PE-lite Is Not Required

- Ordinary implementation tasks with a single-file or single-function write set.
- Bug fixes with an obvious root cause and localized correction.
- Additive changes that introduce new behavior without restructuring existing boundaries.
- Test-only or documentation-only changes.

### What PE-lite Requires

When required, the agent or reviewer must:

1. State the preservation context (invariants, acceptance criteria, authority boundaries).
2. Inventory the inspected locus or coupled loci.
3. Build a burden ledger for each major element or coupled set.
4. Produce a simplification witness (suspicion, candidate, or admissible).
5. Run burden accounting across relevant dimensions.
6. Run a displacement audit verifying burden was eliminated, not relocated.
7. Record the outcome as accepted, rejected, or deferred.

### What PE-lite Forbids

- Simplifications that move burden into hidden convention, operator memory, prompt text, or undocumented policy.
- Simplifications that externalize burden into future debugging, migration, or maintenance effort.
- Compression that reduces textual length while increasing interpretive or decoding cost.
- Flattening of jointly load-bearing or conditionally load-bearing structures.
- Overriding Narada authority boundaries (`ForemanFacade`, `Scheduler`, `IntentHandoff`, `OutboundHandoff`, observation/control separation) in the name of simplification.

### What PE-lite Does Not Do

- It does not apply to every ordinary task.
- It does not promote itself into kernel law (`00-kernel.md`, `SEMANTICS.md`).
- It does not treat resilience, reversibility, observability, optionality, or social legibility as automatic excess.

---

## Canonical Completion Artifact Shape

A valid task completion artifact is not just "substantive work done." It is a **structured record** that makes review and closure mechanically verifiable.

The minimum valid completion shape is:

```markdown
## Execution Notes

<!-- Concrete evidence of what was done. Not a chat summary. -->
- What changed and why
- Files modified
- Decisions made
- Residuals or blockers encountered

## Verification

<!-- How correctness was checked. Not "it works." -->
- Command(s) run
- Result(s) observed
- If verification could not be run, state why explicitly

## Acceptance Criteria

- [x] Every criterion checked (or moved to Residuals with rationale)
```

### Why This Shape Matters

- `## Execution Notes` proves the agent did the work, not just thought about it.
- `## Verification` proves the work was checked, not just assumed correct.
- Checked acceptance criteria prove the task's own gates were satisfied.
- Without these three sections, `narada task evidence` reports `incomplete` and governed closure operators refuse terminalization.

### What Happens When Sections Are Missing

| Missing | Effect |
|---------|--------|
| `## Execution Notes` | `task close` fails with gate failure; `task finish` warns; `task evidence` reports `incomplete` |
| `## Verification` | `task close` fails with gate failure; `task finish` warns; `task evidence` reports `incomplete` |
| Unchecked criteria | `task close` fails; `task finish` warns with count |
| Derivative status files | `task close` fails; `task lint` reports violation |

### Scaffolded Placeholders

`narada task report` and `narada task finish` automatically scaffold missing `## Execution Notes` and `## Verification` sections into the task file with placeholder comments. The agent must still fill them in with real content. Scaffolding does not satisfy the gates — it only makes the expected shape visible.

## Governed Task Closure Invariant

A task may enter `closed` or `confirmed` only when:

1. **All acceptance criteria are checked** — every `- [ ]` in `## Acceptance Criteria` is `- [x]`.
2. **Execution notes exist** — the task file contains an `## Execution Notes` section with concrete evidence of what was done.
3. **Verification notes exist** — the task file contains a `## Verification` section describing how correctness was checked.
4. **No derivative task-status files exist** — no `-EXECUTED.md`, `-DONE.md`, `-RESULT.md`, `-FINAL.md`, or `-SUPERSEDED.md` files for this task.

If a criterion is intentionally not completed, it must be moved out of **Acceptance Criteria** into **Residuals / Deferred Work** with rationale and a concrete follow-up task reference.

Acceptance criteria are not decorative. They are closure gates.

### Closure Authority

- **Review path**: `in_review` → review accepted → `closed` (reviewer-driven).
- **Direct path**: operator may close a task with `narada task close <task-number> --by <operator-id>` if all gates are satisfied.
- **Governed path**: `narada chapter close <range> --finish` transitions `closed` → `confirmed` only after validating every terminal task in the range satisfies the closure invariant.

A task that is terminal-by-front-matter (`closed` or `confirmed`) but invalid-by-evidence is an **invariant violation**, not a documentation nuisance. The violation code is `terminal_with_unchecked_criteria` and is reported by `narada task evidence`, `narada task evidence list`, `narada task lint`, and `narada chapter close --finish`.

### Terminal-State Ownership

Terminal task lifecycle mutation is owned exclusively by governed operators. Raw markdown edits that set `status: closed` or `status: confirmed` are **not authoritative** just because the YAML changed.

**Governed operators that may produce terminal state:**
- `narada task close <task-number> --by <id>` — direct closure after evidence gates
- `narada task review <task-number> --agent <id> --verdict accepted` — review-driven closure when evidence gates are satisfied
- `narada chapter close <range> --finish` — chapter-level promotion from `closed` to `confirmed`

**Machine-detectable provenance:**
Governed operators set the `governed_by` front-matter field:
- `task_close:<operator-id>` for direct closure
- `task_review:<agent-id>` for review-driven closure
- `chapter_close:<operator-id>` for chapter confirmation

**Pre-501 backward compatibility:**
Tasks closed before the `governed_by` mechanism are grandfathered if they have:
- `closed_by` + `closed_at` (pre-501 direct closure), or
- a review record and status `closed` (pre-501 review closure), or
- a closure decision and status `confirmed` (pre-501 chapter closure)

**Raw bypass detection:**
`narada task evidence` and `narada task lint` report `terminal_without_governed_provenance` when a terminal task lacks valid provenance markers. Chapter closure and task recommendation surfaces do not treat such tasks as valid terminal work.

**Repair path:**
`narada task reopen <task-number> [--force]` transitions an invalid terminal task back to `opened` (or `in_review` if a review exists) so it can be re-closed through a governed operator. By default, reopen refuses valid terminal tasks; use `--force` to override.

## Completion

- Check only Definition of Done items that are actually satisfied.
- Add concise execution notes describing what changed and what remains deferred.
- Keep deferred work explicit and bounded.
- Do not silently expand task scope.
