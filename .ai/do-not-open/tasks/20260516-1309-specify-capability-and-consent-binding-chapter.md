---
status: confirmed
depends_on: [1301, 1302, 1303, 1304, 1305]
closed_at: 2026-05-16T00:43:38.748Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify capability and consent binding chapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1306-1313-narada-native-carrier-future-chapter-commissioning.md

## Goal

Create a structured build chapter for binding provider capabilities, data-read capabilities, and consent records to Narada-native carrier sessions.

## Context

Carrier adapters should receive references and projected grants, not raw secrets or implicit authority. Capability and consent binding needs a coherent chapter before live use.

## Required Work

1. Inspect current adapter registration and capability posture code.
2. Define how provider capability refs, data-read capability refs, and consent records are projected into a session.
3. Specify secret redaction, stale grant, revoked grant, and missing consent behavior.
4. Include reconstruction and doctor requirements for configured, blocked, revoked, and fixture-only states.
5. Submit structured chapter input with ordered implementation and verification tasks.

## Non-Goals

- Do not implement a raw secret store in the carrier.
- Do not infer consent from the presence of config files.
- Do not grant mutation capabilities through this chapter.

## Execution Notes

- Inspected current capability posture:
  - `adapter-registration.mjs` records provider `capability_ref`, rejects secret-bearing provider config, and distinguishes granted/ungranted registration posture.
  - `provider-adapter.mjs` looks up provider capability by reference, refuses missing/ungranted/secret-bearing material, and records only capability summaries.
  - `harness.mjs` currently projects facade-only capabilities and withheld authorities, explicitly including credential access and mutation authority.
- Boundary decision: capability consent remains a canonical authority outside the carrier. The carrier receives projected references and bounded grant status only; it never stores raw secret material and never infers consent from config presence.

## Structured Chapter Input

Chapter: `narada-native-capability-consent-binding`

Goal: Bind provider capabilities, data-read capabilities, and consent records into carrier sessions as bounded projections without moving secret, credential, or mutation authority into the carrier.

Continuation Task: task 1333

Ordered implementation tasks:

1. `Define carrier capability projection schema`
   - Fields: `capability_ref`, `capability_kind`, `consent_ref`, `credential_ref_present`, `grant_status`, `grant_freshness`, `revocation_status`, `scope_summary`, `raw_secret_values_recorded=false`, `projected_capabilities_are_not_grants=true`.
   - Verification: schema tests for provider, data-read, fixture-only, missing, revoked, and stale projections.

2. `Implement provider capability projection lookup`
   - Input is provider registration `capability_ref`.
   - Output exposes credential reference presence and policy/scope refs only; raw credential values are never returned or recorded.
   - Refusals: `missing_capability_ref`, `missing_consent_record`, `revoked_capability`, `stale_grant`, `secret_bearing_capability_material`.
   - Verification: tests prove each refusal is bounded and redacted.

3. `Implement data-read capability projection lookup`
   - Bind to-data read families to explicit capabilities: `task_read_packet`, `work_next_peek`, `inbox_summary_read`, `carrier_readiness_read`, `carrier_evidence_ref_read`, `site_file_excerpt_read`.
   - Verification: tests prove missing data-read consent blocks the matching reader without blocking fixture-only carrier lifecycle.

4. `Wire projections into session start and supervisor doctor`
   - Session start records projection refs/statuses, not grants or secrets.
   - Supervisor doctor reports `configured`, `blocked_missing_consent`, `blocked_revoked`, `blocked_stale`, and `fixture_only`.
   - Verification: doctor/reconstruction tests cover each state and omit raw secret values.

5. `Integrate projection checks into provider and to-data execution`
   - Provider invocation requires valid provider projection.
   - To-data readers require valid read-family projection.
   - Revoked/stale/missing grants emit blocked/refused evidence before provider transport or data read execution.
   - Verification: tests prove no provider transport call or data reader call occurs after revoked/missing consent.

6. `Add capability-consent reconstruction proof`
   - Reconstruct session capability posture from durable session evidence and registration/projection summaries.
   - Verification: no direct secret-store inspection is required for reconstruction; raw secret fields are absent.

Residuals:

- This chapter should define the carrier projection interface, not the canonical consent registry itself.
- Credential reveal/use/rotation/revocation remains owned by canonical capability-governed secret management.

## Verification

- Inspected `tools\narada-native-carrier\adapter-registration.mjs`.
- Inspected `tools\narada-native-carrier\provider-adapter.mjs`.
- Inspected `tools\narada-native-carrier\harness.mjs`.

## Acceptance Criteria

- [x] The proposal separates credential references, capability grants, and consent posture.
- [x] The carrier receives only projected authority needed for bounded reads or provider invocation.
- [x] Revoked or missing grants produce bounded blocked posture.
- [x] The chapter is ready for governed commission.
