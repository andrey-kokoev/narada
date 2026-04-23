---
status: closed
created: 2026-04-23
owner: a2
depends_on: [503, 504]
closed_at: 2026-04-23T19:34:53.195Z
closed_by: a2
governed_by: task_close:a2
---

# Task 505 - Taxonomy Mapping And Backfill

## Context

If `zone_template` and `crossing_regime_kind` remain pure doctrine, we still do not know whether they actually compress Narada's existing topology.

## Goal

Back-map Narada's current zones and crossings against the new taxonomies and record where the fit is strong, weak, or deferred.

## Read First

- `.ai/tasks/20260423-503-zone-template-taxonomy.md`
- `.ai/tasks/20260423-504-crossing-regime-kind-taxonomy.md`
- `.ai/tasks/20260423-496-canonical-crossing-inventory-and-backfill.md`
- `SEMANTICS.md` §2.15
- `AGENTS.md`

## Scope

This task owns the mapping/backfill layer:

- attach current canonical zones to zone templates where justified,
- attach current canonical crossings to regime kinds where justified,
- and record residual mismatches.

## Required Work

1. Map current canonical zones to `zone_template` values where the fit is strong.

2. Map current canonical crossings to `crossing_regime_kind` values where the fit is strong.

3. Explicitly mark:
   - ambiguous mappings,
   - weak fits,
   - and deferred cases.

4. Decide where the mapping should live:
   - canonical docs,
   - machine-readable inventory,
   - or both.

5. Update the canonical inventory or docs in a way that remains honest about uncertainty.

## Non-Goals

- Do not force total mapping completeness.
- Do not introduce runtime derivation.
- Do not smuggle provenance-by-construction into this task.

## Acceptance Criteria

- [x] Current canonical zones have a documented mapping to zone templates where justified.
- [x] Current canonical crossings have a documented mapping to regime kinds where justified.
- [x] Ambiguous/deferred cases are explicitly marked.
- [x] The mapping lands in canonical docs and/or inventory without overclaiming.
- [x] Focused verification or blocker evidence is recorded in this task.

## Execution Notes

The concrete mapping/backfill was already completed by Tasks 503 and 504. As a2, I verified completeness:

**Zone template mapping verified:**
All 12 Narada zones are mapped in `ZONE_TEMPLATE_INVENTORY` (`packages/layers/control-plane/src/types/zone-template.ts`):

| Zone | Template | Fit |
|------|----------|-----|
| Source | ingress | strong |
| Operator | ingress | strong |
| Fact | canonicalization | single_instance_pattern |
| Context | compilation | moderate |
| Evaluation | compilation | moderate |
| Work | governance | strong |
| Decision | governance | strong |
| Task | governance | strong |
| Intent | effect_boundary | single_instance_pattern |
| Execution | performance | single_instance_pattern |
| Confirmation | verification | single_instance_pattern |
| Observation | observation | single_instance_pattern |

**Crossing regime kind mapping verified:**
All 11 inventory entries have `kind` mapped in `CROSSING_REGIME_INVENTORY` (`packages/layers/control-plane/src/types/crossing-regime-inventory.ts`):

| Crossing | Kind | Classification |
|----------|------|----------------|
| Fact admission | self_certifying | canonical |
| Evaluation → Decision | policy_governed | canonical |
| Intent admission | intent_handoff | canonical |
| Execution → Confirmation | observation_reconciled | canonical |
| Operator action request | challenge_confirmed | canonical |
| Task attachment / carriage | challenge_confirmed | canonical |
| Task completion | review_gated | canonical |
| Fact → Context | self_certifying | advisory |
| Context → Work | policy_governed | advisory |
| Work → Evaluation | policy_governed | advisory |
| Intent → Execution | observation_reconciled | deferred |

**Ambiguous/deferred cases already recorded:**
- Compilation template: Context vs Evaluation fuzziness noted in `ambiguous` field
- Governance template: Work leases and Task human review noted as mechanical/non-governance sub-elements
- Intent → Execution: deferred pending Task 500 closure review

**Mapping location:** both machine-readable inventory (TypeScript) and canonical docs (SEMANTICS.md §2.15, §2.17).

## Verification

- `pnpm verify` — all 5 steps pass (verified by 503/504; no new code changes).
- Inventory completeness check: all 12 zones mapped, all 11 crossings have `kind`.
- No additional code changes required for 505; backfill was completed during 503/504.

## Residuals / Deferred Work

None. Tasks 503 and 504 effectively merged the taxonomy definition and the backfill mapping into single work units. Task 505 separation was organizational (define taxonomies → map against them), but the implementers completed both steps together.




