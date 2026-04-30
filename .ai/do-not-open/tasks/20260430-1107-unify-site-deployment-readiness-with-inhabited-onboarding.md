---
status: opened
---
# Unify Site deployment readiness with inhabited onboarding

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1105-1109-first-time-operator-ergonomics.md

## Goal

Make Site deployment readiness and inhabited onboarding proof visible as one coherent readiness surface instead of separate doctrine and doctor outputs.

## Context

Narada distinguishes bootstrap from inhabited onboarding. A first-time Operator needs to see whether a Site is merely materialized, actually ready for governed operation, or still in onboarding residuals.

## Required Work

1. Connect Site bootstrap/doctor outputs to the inhabited onboarding readiness model.
2. Add readiness categories that distinguish materialized, configured, operator-bound, role-bound, inbox-capable, work-capable, and proof-complete states.
3. Preserve Plural Embodiment, Singular Authority: readiness must report which locus owns mutations.
4. Ensure the readiness surface can be consumed by the first-time front-door command without duplicate logic.

## Non-Goals

- Do not collapse Site readiness into Git cleanliness alone.
- Do not treat agent availability as proof of Site readiness.
- Do not auto-repair readiness failures without an explicit command.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Site readiness output includes inhabited onboarding state or an explicit not-yet-onboarded state.
- [ ] Readiness output names the governing law source, authority locus, evidence locus, embodiments, and operator-surface posture when available.
- [ ] Readiness distinguishes warnings from blockers and recommends the next bounded command for each blocker.
- [ ] First-time front-door logic consumes the same readiness service or data shape rather than reimplementing checks.
- [ ] Tests prove readiness classification for a fresh Site, a partially bound Site, and a ready Site.
