# Specify Inquiry Doctrine Feedback intake contract

## Goal

Specify how telemetry work emits inquiry branch and doctrine lift candidates.

## Context

Outcome shape is Inquiry Doctrine Feedback. This is a specification task only.

## Required Work

1. Read Inquiry Doctrine Feedback outcome shape plus current inbox envelopes requesting Inquiry Space machinery lift.
2. Specify how Site Telemetry Publication uncertainties enter Inquiry Space as bounded questions, doctrine candidates, or residuals.
3. Define intake fields, provenance, target locus, non-data lift constraint, and closure/evidence expectations.
4. State how to proceed while Inquiry Space machinery is unavailable, including canonical inbox/request evidence.
5. Update docs only and list residual implementation tasks for doctrine grounding MCP package and replay.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:19.481Z: context, required work, dependencies.
- Added `docs/product/site-telemetry-inquiry-doctrine-feedback.v0.md` to specify the intake contract for telemetry inquiry branch candidates, doctrine lift candidates, and concept lifecycle candidates.
- Added fixtures under `docs/product/fixtures/site-telemetry-inquiry-doctrine-feedback` for inquiry branch, doctrine lift, and Canonical Inbox fallback cases.
- Linked the concrete specification from `docs/product/site-telemetry-publication-outcome-shapes.md`.
- Preserved the boundary that Canonical Inbox fallback is visibility/routing evidence, not queryable Inquiry Space storage.
- Preserved the non-data lift constraint for future narada-andrey Inquiry Space machinery work.

## Verification

- Parsed all three JSON fixtures in `docs/product/fixtures/site-telemetry-inquiry-doctrine-feedback` with PowerShell `ConvertFrom-Json`.
- `git diff --check -- docs/product/site-telemetry-inquiry-doctrine-feedback.v0.md docs/product/site-telemetry-publication-outcome-shapes.md docs/product/fixtures/site-telemetry-inquiry-doctrine-feedback` passed.

## Acceptance Criteria

- [x] Inquiry feedback contracts are specified.
- [x] Fallback posture is explicit.
- [x] Task/doctrine/implementation boundaries are preserved.
