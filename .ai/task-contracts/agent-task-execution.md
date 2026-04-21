# Agent Task Execution Contract

This contract applies to Narada task execution unless a task explicitly overrides a rule.

It is paired with `.ai/task-contracts/question-escalation.md`. If a task becomes ambiguous at an authority, semantic, product, safety, private-data, or verification boundary, follow that escalation contract instead of making an arbitrary local decision.

## Artifact Discipline

- Update the original task file as the canonical record.
- Do not create derivative status files.
- Forbidden suffixes: `-EXECUTED.md`, `-DONE.md`, `-RESULT.md`, `-FINAL.md`, `-SUPERSEDED.md`.
- Put completion evidence in the original task under `Execution Notes`, `Verification`, or `Outcome`.
- If a task is obsolete, blocked, or superseded, mark that in the original task file.

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

## Governance Feedback

If you observe friction in the task-governed development system itself (ambiguous contracts, repeated acceptance criteria, hard-to-apply verification policy, task-DAG blocking, contract/implementation mismatch, or a better governing rule), append feedback to `.ai/feedback/governance.md` after completing the task.

Governance feedback is **not** escalation. Escalation means the task is blocked and needs a decision before proceeding. Governance feedback means the task was completed, but the experience revealed something that should improve the system for future work.

- If the issue blocks the task, use `## Escalation Needed` in the task file (see `.ai/task-contracts/question-escalation.md`).
- If the issue does not block the task, finish the task and add governance feedback separately.

## Coherence Control Rules

These rules prevent task execution from becoming performative process.

- **Tasks are pressure intent, not pressure effect.** Creating, renumbering, or assigning a task does not satisfy the task. A task changes project posture only when executable artifacts, reviewed evidence, or explicit residuals are recorded.
- **Counterweight the deformation, not the surface activity.** If review feels overweighted, do not remove review by default; produce evidence that makes review load-bearing. If implementation feels too fast, do not stop coding by default; restore the missing invariant boundary.
- **Fixtures prove usefulness through invariants.** A fixture is not just a happy-path test. It must show that useful behavior passes through the claimed structure and does not bypass authority boundaries.
- **Residuals preserve coherence.** If a correction is not admissible, record a bounded residual instead of narrating around the blocker or patching locally.
- **Do not claim posture change without evidence.** A diagnosis, plan, or task graph may justify work, but completion requires verification or an explicit residual.

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

## Completion

- Check only Definition of Done items that are actually satisfied.
- Add concise execution notes describing what changed and what remains deferred.
- Keep deferred work explicit and bounded.
- Do not silently expand task scope.
