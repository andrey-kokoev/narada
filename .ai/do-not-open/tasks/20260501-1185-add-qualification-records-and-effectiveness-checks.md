---
status: opened
depends_on: [1183]
---

# Add qualification records and effectiveness checks

## Chapter

site-qualification-policy

## Goal

Persist qualification and requalification evidence, including effectiveness checks, without treating prompt text as authority.

## Context

Site qualification needs durable records analogous to competence/training evidence: what role/work class was qualified, which law/context was read, which check proved effectiveness, and when requalification expires.

## Required Work

Design and implement qualification record artifacts or store rows; add commands to record qualification receipt, absorption, effectiveness check, blocked state, expiry, and escalation; ensure records reference law changes/context surfaces by identity and digest; add tests and docs.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Qualification records identify principal, role, work class, Site, law/context surfaces, evidence, effective time, expiry, and issuer/admitter.
- [ ] Effectiveness checks are distinct from read receipts and can be required before sensitive work.
- [ ] Blocked or failed qualification creates explicit escalation/CAPA path.
- [ ] Records are Git-visible or have canonical mutation evidence consistent with Narada authority posture.
- [ ] Tests cover receipt-only, effectiveness pass, effectiveness fail, expiry, and escalation.
