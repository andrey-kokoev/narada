---
status: closed
depends_on: [1307]
closed_at: 2026-05-16T01:12:17.463Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement inbox summary to-data reader

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1321-1326-narada-native-to-data-adapter-foundation.md

## Goal

Implement a bounded read-only inbox summary reader for Narada-native sessions.

## Context

The carrier needs inbox awareness without gaining envelope transition authority or exposing raw payload values.

## Required Work

1. Read inbox state only through canonical inbox list, pending, read, or injected test readers, not direct SQLite as the normal path.
2. Summarize envelope ids, statuses, source refs, kind, target locus, and bounded summary fields.
3. Redact or omit raw secret-like values and unbounded payload text.
4. Add tests proving no inbox status transition occurs.

## Non-Goals

- Do not claim, triage, promote, archive, import, export, or otherwise transition envelopes.
- Do not treat inbox payloads as admitted task evidence.
- Do not expose raw secrets or unbounded envelope bodies.

## Execution Notes

- Extended `tools/narada-native-carrier/to-data-readers.mjs` with `readInboxSummaryToDataPacket`.
- The default reader uses the canonical read-only `narada inbox list --format json --cwd <siteRoot>` surface, with injected readers supported for tests/adapters.
- Inbox summaries include envelope id, status, source ref, kind, target locus, and bounded field-shape metadata.
- Payload-like values are omitted; secret-like payload keys are counted and excluded from recorded key lists.
- Packets record `inbox_status_transition_performed: false` and preserve the shared false mutation flags.
- Extended `tools/narada-native-carrier/to-data-readers.test.mjs` with canonical list attribution, raw payload omission, secret-like omission, and no-transition coverage.

## Verification

- `node --test tools\narada-native-carrier\to-data-readers.test.mjs` passed: 5 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 51 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Inbox summaries are bounded and attributed to canonical read surfaces.
- [x] Secret-like values and unbounded bodies are not recorded.
- [x] Tests prove the reader performs no inbox mutation.
