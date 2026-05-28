# Repair Site Telemetry operations posture fixture status enum mismatch

## Chapter

Site Telemetry Publication / Readiness And Operations

## Goal

Align the operations posture fixture with the secret rotation status enum specified in the operations posture contract.

## Context

Builder review of closed task 1414 found that `docs/product/fixtures/site-telemetry-operations-posture/monitoring-rotation-handoff.valid.json` used `secret_rotation_evidence.status = missing_live_verification`, while `docs/product/site-telemetry-operations-posture.v0.md` lists allowed values as `fresh`, `stale`, `revoked`, `missing`, `rotating`, or `blocked`. The 1414 review had already closed before the rejection could be admitted, so this bounded repair preserves the finding through a new governed task.

## Required Work

1. Read `docs/product/site-telemetry-operations-posture.v0.md` and the monitoring-rotation fixture.
2. Align the fixture's `secret_rotation_evidence.status` with the specified enum, or update the spec only if a new status is explicitly justified.
3. Re-run JSON parsing for the operations posture fixture.
4. Run git diff whitespace checks for the operations posture doc and fixture.
5. Report the repair with the original review finding referenced.

## Non-Goals

- Do not change live monitoring, deployment, Cloudflare, or secret state.
- Do not broaden the operations posture schema beyond the enum mismatch unless the spec requires it.

## Execution Notes

- Confirmed the operations posture spec enumerates `fresh`, `stale`, `revoked`, `missing`, `rotating`, and `blocked` as the allowed secret rotation evidence statuses.
- Repaired `docs/product/fixtures/site-telemetry-operations-posture/monitoring-rotation-handoff.valid.json` by changing `missing_live_verification` to `missing`.
- No live monitoring, deployment, Cloudflare, secret, inbox, or remote state was touched.

## Verification

- `Get-Content docs\product\fixtures\site-telemetry-operations-posture\monitoring-rotation-handoff.valid.json -Raw | ConvertFrom-Json | Out-Null; Write-Output monitoring-rotation-handoff.valid.json` passed.
- `git diff --check -- docs/product/site-telemetry-operations-posture.v0.md docs/product/fixtures/site-telemetry-operations-posture/monitoring-rotation-handoff.valid.json .ai/handoffs/task-1414-closed-review-finding-repair.json` passed.

## Acceptance Criteria

- [x] Fixture status matches the operations posture status contract.
- [x] JSON fixture parses.
- [x] No live external system is mutated.
