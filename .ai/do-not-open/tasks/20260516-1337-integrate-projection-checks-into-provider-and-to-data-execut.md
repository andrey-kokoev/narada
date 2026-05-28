---
status: closed
depends_on: [1309, 1321]
closed_at: 2026-05-16T03:17:02.274Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Integrate projection checks into provider and to-data execution

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1333-1338-narada-native-capability-consent-binding.md

## Goal

Require valid capability projections before provider transport or to-data reader execution.

## Context

Projection posture must be enforced before the carrier touches provider transport or protected read surfaces.

## Required Work

1. Require valid provider projection before provider invocation.
2. Require valid read-family projection before each protected to-data reader.
3. Emit blocked or refused evidence before provider transport or data reader execution when grants are revoked, stale, or missing.
4. Add tests proving no provider transport call or data reader call occurs after revoked, stale, or missing consent.

## Non-Goals

- Do not implement consent override paths in the carrier.
- Do not perform live credential reveal in tests.
- Do not grant mutation capabilities through execution checks.

## Execution Notes

- Provider execution now requires admitted provider capability projection before provider transport invocation.
- All protected to-data readers now require an admitted data-read projection before command execution or file content access.
- Refused evidence is emitted before transport/read execution for missing consent, revoked capability, stale grant, and secret-bearing capability material.
- Added to-data tests proving revoked and stale read projections block before the reader command runs; provider tests already cover missing, revoked, and stale no-transport behavior.

## Verification

- `node --test tools\narada-native-carrier\provider-adapter.test.mjs` - pass, 4 tests.
- `node --test tools\narada-native-carrier\to-data-readers.test.mjs` - pass, 14 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` - pass, 87 tests.
- `pnpm --filter @narada2/cli build` - pass.

## Acceptance Criteria

- [x] Provider invocation and protected to-data reads require valid projections.
- [x] Revoked, stale, and missing grants block before transport or read execution.
- [x] Tests prove no blocked transport or protected reader call occurs.
