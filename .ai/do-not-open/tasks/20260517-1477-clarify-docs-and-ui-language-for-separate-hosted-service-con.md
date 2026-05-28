---
status: confirmed
depends_on: [1433, 1463, 1474]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:05:45.113Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779051921004_v8m2xl
closed_at: 2026-05-17T21:06:01.136Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Clarify docs and UI language for separate hosted service concerns

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1475-1481-separate-site-telemetry-from-site-registry.md

## Goal

Patch documentation and visible UI labels so the hosted surface reads as distinct service concerns rather than one undifferentiated Site telemetry service.

## Context

After the boundary and audit, the docs and UI should tell agents that Site telemetry publication, Site Registry relation lifecycle, registry ops, and communications have separate authority and tools.

## Required Work

1. Update the minimal set of docs identified by the audit to use the four-concern vocabulary.
2. Adjust package README and human shell wording where it currently implies Site Registry is merely Site telemetry or vice versa.
3. Preserve compatibility notes for existing package, route, binding, and command names.
4. Add explicit warnings near `narada site-telemetry publish` docs that it is not the Site Registry relation publication tool.
5. Add or update focused docs tests if current tests assert the old wording.

## Non-Goals

- Do not rename deployed Worker, route paths, D1/KV bindings, or secret names.
- Do not split package code.
- Do not add new live publication behavior.

## Execution Notes

- Updated `docs/product/site-telemetry-publication.md` to describe the Cloudflare package as co-locating four concerns rather than treating Site Registry as a Site Telemetry Publication subchapter.
- Added explicit warning that Site Registry relation activation/withdrawal/suppression/retirement requires a Site Registry relation command family, not `site-telemetry publish`.
- Updated `docs/product/site-telemetry-publication-outcome-shapes.md` so Site Registry read model and Remote Candidate Exchange are adjacent concerns, not parts of Site Operational Telemetry.
- Updated `packages/site-registry-cloudflare/README.md` to use the four-concern vocabulary while preserving package, route, binding, and import compatibility posture.
- Updated visible dashboard section title from `Site Registry / Telemetry` to `Registry Projection` and clarified the summary.

## Verification

- `narada test-run run --task 1477 --cmd 'rg -n "Registry Projection|four-concern vocabulary|not `site-telemetry publish`|Adjacent Site Registry Read Model|Adjacent Remote Candidate Exchange" docs/product/site-telemetry-publication.md docs/product/site-telemetry-publication-outcome-shapes.md packages/site-registry-cloudflare/README.md packages/site-operational-dashboard/src/index.ts' --scope focused --requester narada.architect --rationale 'Verify clarified concern vocabulary and warning text.' --cwd D:\code\narada` passed as `run_1779051921004_v8m2xl`.
- `narada test-run run --task 1477 --cmd 'pnpm --dir packages/site-registry-cloudflare exec vitest run test/communication-docs.test.ts' --scope focused --requester narada.architect --rationale 'Verify hosted registry communication docs wording still satisfies posture tests.' --cwd D:\code\narada` passed as `run_1779051921848_wzi0ts`.
- `narada test-run run --task 1477 --cmd 'pnpm --dir packages/site-operational-dashboard exec vitest run test/site-operational-dashboard.test.ts' --scope focused --requester narada.architect --rationale 'Verify dashboard projection label change does not break dashboard tests.' --cwd D:\code\narada` passed as `run_1779051921848_db4l13`.

## Acceptance Criteria

- [x] Docs use separate service concern vocabulary.
- [x] UI/readme language no longer invites using Site telemetry publish for relation lifecycle.
- [x] Compatibility posture remains explicit.
