---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T15:14:22.023Z
criteria_proof_verification:
  state: unbound
  rationale: capability bind-credential is the sanctioned credential reference reuse path; it records provenance and local-material status without raw secrets; preflight and onboarding docs route missing credential material to this command; focused tests and live readbacks cover existing reference reuse, missing material, redaction, and provenance fields.
closed_at: 2026-04-30T15:14:40.745Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add credential binding reuse command for Site onboarding

## Goal

Replace manual `.env` copying during Site onboarding with a governed credential binding command that records credential reference/reuse provenance without exposing raw secrets.

## Context

Inbox envelope `env_285e8922-6cc8-41ef-984a-3ac81f4753a0` reports that CPY onboarding reused an existing Graph app/tenant credential posture by copying another Site's local `.env`. That worked operationally but is not a principled Narada credential-binding crossing.

Narada already treats secrets as authority-bearing capabilities. Onboarding needs a command path that binds or reuses credential references with provenance, redaction, and clear authority boundaries.

## Required Work

1. Inspect current credential, capability, consent, env, preflight, and Site bootstrap surfaces.
2. Define a credential binding/reuse command path for Site onboarding that distinguishes raw secret material, credential reference, grant/consent, and local runtime availability.
3. Implement a sanctioned command or command stub that records provenance for reusing an existing credential posture without printing raw secrets.
4. Make preflight/doctor output guide the Operator to the credential binding command instead of implying manual `.env` copying.
5. Add tests for binding an existing credential reference, missing local secret material, redacted output, and provenance recording.
6. Document the safe path and explicitly prohibit direct `.env` copying as the normal onboarding route.

## Non-Goals

- Do not invent a full secret manager if the existing capability-consent model can express the first step.
- Do not print, commit, or export raw secrets.
- Do not mutate external identity providers.
- Do not remove emergency/manual local recovery paths; demote them from normal onboarding.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A sanctioned command or documented command stub exists for binding/reusing a credential reference during Site onboarding
- [x] Output records credential provenance without exposing raw secret values
- [x] Preflight or doctor points to the credential binding path when local secret material is missing
- [x] Direct `.env` copying is documented as non-canonical/manual recovery, not normal onboarding
- [x] Tests cover existing-reference reuse, missing local material, redaction, and provenance fields
