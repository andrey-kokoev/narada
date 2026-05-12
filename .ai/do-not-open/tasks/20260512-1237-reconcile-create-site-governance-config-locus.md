---
status: closed
closed_at: 2026-05-12T23:39:28.978Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Reconcile create-site governance config locus

## Goal

Resolve the create-site root config.json versus .narada/site.json authority ambiguity found in doctrine review.

## Context

Doctrine review found narada sites create still plans and writes root config.json as Site governance coordinates, while current Narada Site authority posture treats .narada/site.json as authority seed. Root config.json may be a compatibility projection, but the code/tests do not name it that way.

## Required Work

1. Inspect create-site command and tests around root config.json and .narada/site.json. 2. Reconcile the locus by either moving canonical governance config under .narada or explicitly marking root config.json as compatibility projection while .narada/site.json remains authority seed. 3. Update tests/docs as needed. 4. Verify focused create-site tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Updated `packages/layers/cli/src/commands/sites.ts` so planned and materialized root `config.json` is explicitly a compatibility projection.
- Added `projection_posture`, `authority_source`, and `authority_effect` fields to materialized root `config.json`.
- Preserved `.narada/site.json` as the Site authority seed and did not move live runtime state or grant additional capability.
- Updated `packages/layers/cli/test/commands/sites-create.test.ts` to assert the projection/authority boundary.

## Verification

- `pnpm --dir packages/layers/cli exec vitest run test/commands/sites-create.test.ts`
  - Result: 22 tests passed.
- `pnpm --dir packages/layers/cli typecheck`
  - Result: passed.

## Acceptance Criteria

- [x] Create-site output no longer implies root config.json is canonical Site authority
- [x] Tests assert the intended authority/projection boundary
