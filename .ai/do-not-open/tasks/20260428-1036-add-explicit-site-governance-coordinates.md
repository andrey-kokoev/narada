---
status: closed
amended_by: architect
amended_at: 2026-04-28T21:30:27.548Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T21:37:20.488Z
criteria_proof_verification:
  state: unbound
  rationale: All acceptance criteria were satisfied by the implementation and bounded verification recorded in report wrr_d9f63473_20260428-1036-add-explicit-site-governance-coordinates_architect: schema-backed governance coordinates, generated contained Site config coordinates, docs/example, metadata-only effect posture, focused tests, typecheck, lifecycle export, and pnpm verify.
closed_at: 2026-04-28T21:37:33.109Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add explicit Site governance coordinates

## Chapter

site-governance

## Goal

Make Site-level governance coordinates explicit so a Site can declare governing law source, authority locus, embodiments, mutation evidence locus, capability grant source, readiness phase, and federation/intake/outbox posture without collapsing law source, runtime embodiment, and mutation authority.

## Context

The Operator identified that Site identity still relies on implicit prose for law source and adjacent governance coordinates. This creates ambiguity between governing law source, mutation authority, runtime embodiments, evidence locus, capabilities, readiness phase, and federation/intake/outbox posture. The work must make these coordinates explicit without granting new effects or collapsing local Site authority into Narada proper.

## Required Work

1. Inspect existing Site manifest/config/bootstrap docs and tests to find the canonical place for Site governance coordinates. 2. Add structured definitions for governing_law_source, law_admission_mode, authority_locus, embodiments, mutation_evidence_locus, inbox/intake sources, outbox targets, effect authority policy, capability grants, lineage source, readiness phase, operator identity, agent identity contract, local overlays, and federation policy. 3. Wire the coordinates into the smallest existing schema/config/generation surface that owns Site identity, or document why a coordinate remains docs-only for now. 4. Preserve law-source versus mutation-authority separation and Plural Embodiment/Singular Authority. 5. Add examples for Narada proper inherited law with local Site overlays. 6. Add focused tests for schema/generation/doc-owned coordinates where code changes are made. 7. Verify, report, prove criteria, review, close, commit, push.

## Non-Goals

Do not grant runtime or effect authority through metadata alone. Do not rename existing public CLI flags. Do not migrate existing Site configs unless needed for tests. Do not create speculative daemon behavior.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-28T21:30:27.548Z: context, required work, non-goals

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Site config types expose explicit governance coordinate fields with structured shapes rather than prose-only conventions
- [x] Site manifest/schema or product docs define governing_law_source
- [x] authority_locus
- [x] embodiments
- [x] mutation_evidence_locus
- [x] capability_grants
- [x] readiness_phase
- [x] intake/outbox/federation posture
- [x] and local overlays
- [x] Generated or validated Site guidance preserves law-source versus mutation-authority separation
- [x] Docs include a compact example showing Narada proper law inheritance with local Site overlays
- [x] No runtime effect authority is granted by declaring governance coordinates
- [x] Focused tests and pnpm verify pass
