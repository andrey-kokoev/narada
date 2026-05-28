---
status: closed
depends_on: [1309, 1321]
closed_at: 2026-05-16T03:15:56.469Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement data-read capability projection lookup

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1333-1338-narada-native-capability-consent-binding.md

## Goal

Bind to-data read families to explicit read capability projections.

## Context

Data reads require their own consent posture and must not be implied by provider configuration.

## Required Work

1. Bind task_read_packet, work_next_peek, inbox_summary_read, carrier_readiness_read, carrier_evidence_ref_read, and site_file_excerpt_read to explicit projections.
2. Return bounded grant, consent, freshness, and revocation posture for each read family.
3. Add tests proving missing read consent blocks the matching reader without blocking fixture-only carrier lifecycle.

## Non-Goals

- Do not collapse all reads into one broad filesystem or task capability.
- Do not grant mutation capabilities to to-data readers.
- Do not require provider capability to read fixture-only readiness evidence.

## Execution Notes

- Added explicit data-read capability bindings for task packet, work-next peek, inbox summary, readiness snapshot, evidence ref summary, and bounded file excerpt reads.
- Added data-read projection lookup in `tools/narada-native-carrier/capability-projection.mjs`, returning bounded grant/consent/freshness/revocation/scope posture.
- Wired all to-data readers through the projection lookup before command execution or local file reads.
- Added tests proving missing consent blocks only the matching read family and fixture-only readiness remains inspectable without provider capability.

## Verification

- `node --test tools\narada-native-carrier\capability-projection.test.mjs` - pass, 6 tests.
- `node --test tools\narada-native-carrier\to-data-readers.test.mjs` - pass, 13 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` - pass, 84 tests.
- `pnpm --filter @narada2/cli build` - pass.

## Acceptance Criteria

- [x] Every to-data read family has an explicit projection lookup.
- [x] Missing data-read consent blocks only the matching read family.
- [x] Tests prove fixture-only lifecycle remains inspectable without provider capability.
