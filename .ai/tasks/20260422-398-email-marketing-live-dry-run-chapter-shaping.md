---
status: closed
closed: 2026-04-22
depends_on: [394, 397]
---

# Task 398 — Email Marketing Live Dry Run Chapter Shaping

## Execution Mode

Planning mode is required before edits.

The agent must first list:
- Intended write set
- Invariants at risk
- Dependency assumptions
- Focused verification scope

This is a chapter-planning task. It must create a minimal follow-up task graph. It must not implement the live dry run.

## Assignment

Create the next chapter plan for turning the fixture-proven email-marketing Operation into a supervised live dry run.

The chapter must drive Narada from:

> fixture-backed email-marketing proof

to:

> one real inbound campaign request from a configured mailbox/source produces a governed campaign brief or missing-info attention item, with no Klaviyo mutation and no campaign send/publish.

## Required Reading

- `.ai/task-contracts/chapter-planning.md`
- `SEMANTICS.md`
- `docs/deployment/email-marketing-operation-contract.md`
- `docs/deployment/campaign-request-fact-model.md`
- `docs/deployment/campaign-charter-knowledge-binding.md`
- `docs/deployment/klaviyo-intent-boundary.md`
- `docs/deployment/windows-site-real-cycle-wiring.md`
- `docs/deployment/operator-console-fit.md`
- `.ai/decisions/20260422-394-email-marketing-operation-closure.md`
- `.ai/decisions/20260422-397-session-attachment-semantics.md`
- `.ai/tasks/20260422-387-394-email-marketing-operation.md`

## Context

Tasks 387–394 proved the email-marketing Operation structurally and by fixture. That chapter did not prove live usefulness against a real mailbox/source, real private knowledge, or an operator-facing dry-run loop.

The next chapter must stay narrow. It is not a Klaviyo integration chapter. It is not a production deployment chapter. It is a supervised live dry run chapter.

## Chapter Boundary

The chapter should include only the work required to run a safe, supervised live dry run:

- configure a private ops repository or Site root for an email-marketing Aim;
- bind one real inbound source/mailbox or controlled mailbox thread;
- bind private knowledge sources without committing private data into public Narada;
- run one Cycle or bounded command that admits real facts;
- produce either a campaign brief draft or missing-info attention item;
- make the result inspectable by operator CLI/console;
- prove no Klaviyo mutation, publish, or send occurred.

## Required Work

1. Produce a readiness/gap decision artifact.

   Create:
   - `.ai/decisions/20260422-398-email-marketing-live-dry-run-readiness.md`

   It must answer:
   - What is already proven by Tasks 387–394?
   - What remains unproven for live dry-run usefulness?
   - Which artifacts belong in public Narada?
   - Which artifacts belong in a private ops repo?
   - What exact live input is acceptable for the first run?
   - What must be observable after the run?
   - What must be impossible in the run?

2. Create a chapter DAG file.

   Use the next monotonically available range after this task.

   Expected shape, if still correct after analysis:
   - live ops repo / Site config contract
   - private knowledge binding
   - controlled live input selection
   - live dry-run execution command/surface
   - operator inspection and no-effect proof
   - chapter closure

   Put the reduced DAG in `.ai/tasks/YYYYMMDD-NNN-MMM.md`.
   Mermaid must be plain. Do not add classes or styling.

3. Create self-standing follow-up tasks.

   Each task must be executable by number alone and include:
   - required reading
   - concrete deliverables
   - explicit non-goals
   - acceptance criteria
   - verification scope

4. Include a CCC posture table.

   Use the shape from `.ai/task-contracts/chapter-planning.md`.

   The table must distinguish:
   - evidenced state now
   - projected state if the live dry-run chapter verifies
   - pressure path
   - evidence required

5. Preserve authority boundaries.

   The chapter must explicitly preserve:
   - Intelligence may draft a campaign brief, not publish/send.
   - Klaviyo mutations remain forbidden.
   - Missing credentials or missing campaign data become operator attention items.
   - Private knowledge stays outside the public Narada repo.
   - Live input is bounded and selected; no unbounded mailbox sweep for the first run.

6. Include session/attachment semantics where relevant.

   Use Task 397’s vocabulary if the dry run needs attach/resume/operator context. Do not invent a second attachment model.

## Non-Goals

- Do not implement the live dry run in this task.
- Do not create private customer/brand data in the public repo.
- Do not add real Klaviyo API execution.
- Do not create a generic marketing automation framework.
- Do not generalize Site abstractions beyond what the live dry run needs.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Readiness/gap decision artifact exists.
- [x] Chapter DAG file exists with monotonically increasing task numbers.
- [x] Follow-up tasks are self-standing and executable by number alone.
- [x] CCC posture table includes evidenced state and projected state.
- [x] Public/private artifact boundary is explicit.
- [x] Live input selection is bounded.
- [x] Klaviyo mutation, publish, and send are explicitly impossible in the planned dry run.
- [x] Task 397 session/attachment vocabulary is referenced where relevant.
- [x] No implementation code is added.
- [x] No derivative task-status files are created.

## Execution Notes

Task completed prior to Task 474 closure invariant. Decision artifact `.ai/decisions/20260422-398-email-marketing-live-dry-run-readiness.md` created. Chapter DAG `.ai/tasks/20260422-399-405-email-marketing-live-dry-run.md` created with monotonically increasing task numbers 399–405. Follow-up tasks (399–405) are self-standing. CCC posture table includes evidenced and projected states. Authority boundaries preserved (no Klaviyo mutation, bounded live input).

## Verification

Verified by inspecting `.ai/decisions/20260422-398-email-marketing-live-dry-run-readiness.md` and `.ai/tasks/20260422-399-405-email-marketing-live-dry-run.md`.
