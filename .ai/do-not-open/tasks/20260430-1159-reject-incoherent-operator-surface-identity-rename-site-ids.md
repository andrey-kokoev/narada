---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T23:51:14.239Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777593032957_aqx7wx
closed_at: 2026-04-30T23:51:30.926Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Reject incoherent operator-surface identity rename Site ids

## Chapter

Canonical Inbox Promotions

## Goal

Ensure operator-surface identity rename rejects or repairs Site-qualified names whose Site id is not registered, canonical, or coherent with the target Site locus.

## Context

Source inbox envelope: env_4539cf01-ef62-4738-af9e-75b9012ea011

Source: agent_report:narada-andrey-operator-surface-rename-20260430

Envelope kind: observation

Summary: While renaming narada-andrey.architect to Kevin, the operator-surface identity rename command rejected narada-andrey.Kevin as a site_locus_mismatch because the registry owner Site id was andrey-user, then accepted andrey-user.Kevin. The operator correctly identified this as incoherent: the Site is known and lived as narada-andrey, not andrey-user. Tooling should not admit or suggest identity names under unregistered or incoherent Site ids.

Evidence:
- operator-surfaces/identities.json has owner_site_id andrey-user while the Operator recognizes the User Site as narada-andrey
- narada operator-surface identity rename --from narada-andrey.architect --to narada-andrey.Kevin failed with site_locus_mismatch requested_new_site_id narada-andrey old_site_id andrey-user
- narada operator-surface identity rename --to andrey-user.Kevin succeeded, producing a coherent-by-tool but incoherent-by-Site identity

Proposal:
- Operator-surface identity commands must validate Site names against canonical registered Site identity, not local incidental owner_site_id strings; when mismatch exists, refuse mutation and provide a repair command to reconcile the Site id first.
- Add a preflight invariant: durable identity prefix, registry owner_site_id, Site config id, repository/Site display name, and routing address must be constructively aligned or explicitly aliased by governed Site identity records.

Recommendation: Treat as CAPA and priority execution item before further identity rename/migration work.

## Required Work

0. Source summary: While renaming narada-andrey.architect to Kevin, the operator-surface identity rename command rejected narada-andrey.Kevin as a site_locus_mismatch because the registry owner Site id was andrey-user, then accepted andrey-user.Kevin. The operator correctly identified this as incoherent: the Site is known and lived as narada-andrey, not andrey-user. Tooling should not admit or suggest identity names under unregistered or incoherent Site ids.
1. Read source inbox envelope env_4539cf01-ef62-4738-af9e-75b9012ea011 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Identity rename validates requested Site id against registered/canonical Site ids before admitting the new identity.
- [x] Errors explain the canonical Site id and repair command instead of accepting an incoherent substitute.
- [x] Focused tests cover unregistered Site id, canonical Site id, and mismatch guidance.
