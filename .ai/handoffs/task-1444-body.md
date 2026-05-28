# Add governed verifier enrollment and rotation posture

## Chapter

Site Registry Relation Lifecycle / Site-Scoped Capability Verifiers

## Goal

Provide a bounded enrollment/rotation path for creating and replacing Site relation withdrawal verifiers.

## Context

The hardest authority question is who may create the first verifier. The implementation needs an explicit admin-gated or evidence-gated path instead of treating D1 writes as silent authority.

## Required Work

1. Implement a protected enrollment path or documented operator-only seed command for creating the first verifier with evidence refs.
2. Implement rotation/revocation support with retained audit evidence and no raw secret echo.
3. Require registry-owner/admin standing for v0 enrollment unless an existing Site publication capability is explicitly admitted as bootstrap evidence.
4. Add dry-run/preflight or smoke fixture support so live enrollment is not accidental.
5. Document that creating or rotating live remote secret material is a capability-governed secret operation.

## Non-Goals

- Do not automate live secret generation in default tests.
- Do not grant Site authority merely because a request reached the Worker.
- Do not make enrollment public or unauthenticated.

## Execution Notes

- Added `planRelationCapabilityVerifierEnrollment` as an inert preflight/seed plan helper.
- Enrollment planning requires registry-owner/operator standing, relation capability refs, credential refs, and bounded evidence refs.
- Live D1 mutation is planned only with explicit `execute: true` and `admin_approved: true`; remote secret mutation is always false in this helper.
- Added `rotateSiteRegistryRelationCapabilityVerifier` to supersede the old verifier, retain audit evidence, and create a new active verifier without serializing raw secret values.
- Preserved existing revocation helper behavior from the storage slice and expanded tests around revocation/rotation active lookup.
- Documented the operator seed/preflight posture and the separate capability-governed secret operation boundary in the verifier contract and Cloudflare runbook.
- Stabilized the relation lifecycle smoke fixture test by stamping the submitted health event at runtime while preserving the fixture shape; the previous fixed timestamp aged out of the freshness window during execution.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 52 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `git diff --check -- packages/site-registry-cloudflare/src/index.ts packages/site-registry-cloudflare/test/worker-boundary.test.ts packages/site-registry-cloudflare/test/smoke-fixture.test.ts docs/product/site-registry-relation-capability-verifier.v0.md docs/deployment/cloudflare-hosted-site-registry.md` passed, with line-ending warnings only.

## Acceptance Criteria

- [x] Enrollment authority is enforced by a protected path or explicit seed workflow.
- [x] Rotation/revocation retain evidence and disable old verifier use.
- [x] Live mutation remains explicitly gated.
- [x] Tests cover first enrollment, rotation, revocation, and refusal posture.
