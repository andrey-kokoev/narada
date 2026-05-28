---
status: closed
depends_on: [1307]
closed_at: 2026-05-16T01:16:28.861Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement task and work-next to-data readers

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1321-1326-narada-native-to-data-adapter-foundation.md

## Goal

Implement read-only task and work-next packet readers for Narada-native sessions.

## Context

The carrier must be able to inspect assigned work and possible next work without claiming, reporting, closing, or mutating lifecycle state.

## Required Work

1. Route task packet reads through narada task read --format json or an injected equivalent reader.
2. Route work selection through a no-claim peek surface when available, and return a refusal packet if only claim-capable work-next surfaces are available.
3. Record command/source attribution, cwd or Site root, requested task or agent, timestamp, and bounded field presence.
4. Add tests proving task claim, report, review, close, inbox, outbox, command, publication, and repository mutation flags remain false.

## Non-Goals

- Do not use direct SQLite reads as the normal task or work-next interface.
- Do not record raw task markdown in carrier evidence.
- Do not auto-claim work from the to-data reader.

## Execution Notes

- Added `tools/narada-native-carrier/to-data-readers.mjs` with read-only task and work-next to-data packet readers.
- Task reads use `narada task read <task> --format json --cwd <siteRoot>` by default, or an injected equivalent reader for tests/adapters.
- Work-next reads use `narada task work-next --agent <agent> --peek --format json --cwd <siteRoot>` by default and return a refusal packet without command execution when no no-claim peek surface is available.
- Packets record command/source attribution, cwd/Site root, requested task or agent, timestamp, bounded field presence, and explicit false mutation flags for task claim/report/review/close, inbox, outbox, command, publication, and repository mutation.
- Added `tools/narada-native-carrier/to-data-readers.test.mjs` covering task reads, work-next peek reads, refusal without no-claim peek, and no-mutation flags.
- Review continuation: replaced the invalid default `narada task work-next --peek` route with the actual no-claim `narada task peek-next --format json` surface and updated packet fixture/source-surface text.

## Verification

- `node --test tools\narada-native-carrier\to-data-readers.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\to-data-packet.test.mjs` passed: 2 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 49 tests.
- `pnpm --filter @narada2/cli build` passed.
- Review continuation: `narada task peek-next --agent narada.builder --format json` passed and returned a no-claim `peek_next` packet.
- Review continuation: `node --test tools\narada-native-carrier\to-data-readers.test.mjs` passed: 11 tests.
- Review continuation: `node --test tools\narada-native-carrier\to-data-packet.test.mjs` passed: 2 tests.
- Review continuation: `node --test tools\narada-native-carrier\*.test.mjs` passed: 58 tests.
- Review continuation: `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Task reads produce bounded to-data packets through canonical Narada surfaces.
- [x] Work-next reads refuse safely when no no-claim read surface is available.
- [x] Tests prove the readers do not mutate lifecycle, inbox, outbox, command, publication, or repository state.
