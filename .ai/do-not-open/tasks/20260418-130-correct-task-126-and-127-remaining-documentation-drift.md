# Task 130: Correct Task 126 And 127 Remaining Documentation Drift

## Why

Reviews of Tasks 126 and 127 found that the core semantic corrections landed, but a few documentation surfaces still drift from the actual current state.

These are not large architectural defects. They are small but important fidelity problems in canonical docs and audit artifacts.

Leaving them around makes the repo feel less trustworthy than it should.

## Scope

This is a narrow cleanup task covering only the remaining documented drift from Tasks 126 and 127.

It should not reopen the broader onboarding, taxonomy, or semantic-audit work.

## Findings Being Corrected

### 1. Task 126 residual wording drift in first-run docs

Task 126 fixed the safe-trial mechanics, but some wording still reflects the older live-first framing or derived posture terminology.

Examples already observed in review:

- `QUICKSTART.md` still opens with live-first framing even though it now presents three entry paths
- live-path explanatory text still uses derived labels like `send-capable`

These do not break the feature, but they weaken the coherence that Task 126 was meant to establish.

### 2. Task 127 audit result still contains one stale README characterization

Task 127 corrected most of the Task 124 audit, but one factual description remains stale.

The audit currently says the root README command table only lists 4 legacy runtime commands.

That is no longer true. The current README table already includes:

- `demo`
- `init-repo`
- `init-repo --demo`

The cavity remains valid because the command table is still incomplete, but the factual description must match the current tree exactly.

## Goal

Bring the remaining docs and audit language into exact alignment with the actual repo state after Tasks 126 and 127.

## Required Outcomes

### 1. Tighten Task 126-related wording

Update first-run docs so they consistently reflect the new entry-path model and the actual posture vocabulary.

At minimum review and correct:

- `QUICKSTART.md` intro framing
- any remaining live-first phrasing that contradicts the three-path model
- any remaining derived posture labels that should instead use canonical user-facing naming

### 2. Fix the remaining stale statement in the Task 124 audit result

Update `.ai/do-not-open/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md` so its README characterization matches the current README exactly.

The corrected wording should say, in substance:

- the README command table is partially updated
- it includes some new shaping/trial commands
- it is still incomplete relative to the full CLI surface

It must not claim the table contains only the 4 legacy runtime commands if that is no longer true.

### 3. Keep the corrections narrow and factual

Do not use this task to reopen larger semantic debates.

Only correct statements that are still observably drifting from the current tree.

## Deliverables

- corrected `QUICKSTART.md` wording for the post-126 first-run model
- corrected Task 124 audit result wording for the post-127 README state
- any other small doc-fidelity fixes directly implied by these two reviews

## Definition Of Done

- [ ] first-run docs no longer contain the reviewed residual wording drift from Task 126
- [ ] the Task 124 audit result no longer misstates the current README command table
- [ ] all corrections are narrow, factual, and aligned with the current tree

## Notes

This is a cleanup task for documentation fidelity.

It should leave the repo in a state where the implemented behavior, the first-run docs, and the canonical audit all say the same thing.
