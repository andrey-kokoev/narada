---
status: closed
depends_on: [1307]
closed_at: 2026-05-16T01:17:34.788Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add integrated to-data adapter reconstruction proof

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1321-1326-narada-native-to-data-adapter-foundation.md

## Goal

Prove the to-data adapters compose into a bounded Narada-native data bundle.

## Context

After individual readers exist, the carrier needs an end-to-end mocked read bundle that can feed orchestration without carrying mutation authority.

## Required Work

1. Build an end-to-end mocked carrier session that reads task, work-next or refusal, inbox summary, readiness, evidence refs, and a bounded file excerpt into one to-data bundle.
2. Verify the bundle records source attribution, capability refs, freshness, and no-mutation flags for every read family.
3. Verify no raw secrets, unbounded transcripts, direct SQLite requirement, raw provider output, or authority-bearing mutations are recorded.
4. Document residuals for capability consent binding and orchestration wrapper chapters.

## Non-Goals

- Do not invoke live intelligence providers in this proof.
- Do not submit task reports, inbox transitions, outbox intents, command intents, or publications.
- Do not require network access for tests.

## Execution Notes

- Added `tools/narada-native-carrier/to-data-bundle.mjs` with `buildIntegratedToDataBundle`.
- The integrated proof composes task, work-next refusal, inbox summary, readiness snapshot, evidence ref summary, and bounded file excerpt packets into one bundle.
- The bundle validates source attribution, capability refs, bounded freshness, and no-mutation flags for every read family.
- The proof records residuals for capability consent binding and orchestration wrapper chapters.
- Added `tools/narada-native-carrier/to-data-bundle.test.mjs` with an end-to-end mocked carrier session.
- Review continuation: reran the integrated proof after the bounded file excerpt reader containment fix for Windows cross-drive absolute paths.

## Verification

- `node --test tools\narada-native-carrier\to-data-bundle.test.mjs` passed: 1 test.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 58 tests.
- `pnpm --filter @narada2/cli build` passed.
- Review continuation: `node --test tools\narada-native-carrier\to-data-bundle.test.mjs` passed: 1 test.
- Review continuation: `node --test tools\narada-native-carrier\to-data-readers.test.mjs` passed: 11 tests, including cross-drive absolute path refusal.
- Review continuation: `node --test tools\narada-native-carrier\*.test.mjs` passed: 58 tests.
- Review continuation: `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] An integrated mocked to-data bundle proof exists.
- [x] The proof covers all required read families or explicit refusal packets.
- [x] Tests prove the bundle is bounded, attributed, reconstructable, and non-mutating.
