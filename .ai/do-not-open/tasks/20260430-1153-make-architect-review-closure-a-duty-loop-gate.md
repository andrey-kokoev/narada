---
status: claimed
---

# Make Architect review closure a duty-loop gate

## Goal

Prevent Builder 'no work' reports from being misread as system idle when Architect review/closure or blocker routing is the actual next duty.

## Context

Source inbox envelope env_fe6ba6d8-1043-47ef-adff-865e12ea9be1 reports a User Site incident where Builder reported no work while several completed tasks were awaiting Architect/operator review and closure. The apparent empty queue was caused by pending reviews and underspecified handoffs.

## Required Work

1. Document the duty-loop rule: when Builder reports no work, Architect must check pending reviews, blocked tasks, underspecified handoffs, and review-owned blockers before treating the system as idle. 2. Enhance work-next/workboard or specify the command path so pending reviews are surfaced as blocker-owner work for Architect/operator, not invisible to Builder. 3. Add compact architect-loop output or checklist covering pending reviews, in-progress architect-owned work, underspecified handoffs, blocked Builder tasks, and next nudge target. 4. Update doctrine/onboarding so Builders finish/report and Architects/reviewers close/unblock; Builder no-work is evidence for Architect review, not proof of no system work. 5. Add focused regression coverage or fixtures for the incident shape: Builder has no recommendation because upstream tasks await Architect review/closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Architect duty-loop documentation requires checking reviews/blockers before accepting Builder no-work as idle.
- [ ] A compact command or output path surfaces pending review/closure as Architect/operator-owned blocker work.
- [ ] Builder-facing no-work/recommendation output gives actionable blocker-owner context when reviews or closures block new work.
- [ ] Docs distinguish Builder finish/report duties from Architect/reviewer closure duties.
- [ ] Tests or fixtures cover Builder no-work caused by pending reviews/closures.
