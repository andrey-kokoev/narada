---
status: closed
depends_on: [1309, 1321]
closed_at: 2026-05-16T03:17:22.321Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add capability-consent reconstruction proof

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1333-1338-narada-native-capability-consent-binding.md

## Goal

Prove session capability posture can be reconstructed from bounded carrier evidence.

## Context

Reconstruction should not require raw secret-store inspection or unbounded transcripts.

## Required Work

1. Reconstruct session capability posture from durable session evidence and registration/projection summaries.
2. Assert no direct secret-store inspection is required for reconstruction.
3. Assert raw secret fields are absent from evidence and doctor output.
4. Document residuals owned by canonical capability-governed secret management.

## Non-Goals

- Do not implement credential reveal, use, rotation, or revocation authority in the carrier.
- Do not store raw secret material for reconstruction.
- Do not make reconstructed posture equivalent to canonical consent truth.

## Execution Notes

- Added `capability_consent_reconstruction` to native carrier reconstruction/readiness output.
- The reconstruction derives bounded capability posture from durable session start projection summaries and provider adapter projection evidence.
- The reconstruction explicitly records that direct secret-store inspection is not required.
- Residual ownership for credential secret resolution and rotation is assigned to canonical capability-governed secret management.
- Added readiness tests proving bounded reconstruction, absent raw secret fields, and explicit residual ownership.

## Verification

- `node --test tools\narada-native-carrier\readiness.test.mjs` - pass, 5 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` - pass, 88 tests.
- `pnpm --filter @narada2/cli build` - pass.

## Acceptance Criteria

- [x] Capability posture reconstructs from bounded session and projection evidence.
- [x] No direct secret-store inspection is required for reconstruction.
- [x] Tests prove raw secret fields are absent and residual ownership is explicit.
