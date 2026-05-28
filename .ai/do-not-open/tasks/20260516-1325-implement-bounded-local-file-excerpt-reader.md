---
status: closed
depends_on: [1307]
closed_at: 2026-05-16T01:17:00.042Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement bounded local file excerpt reader

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1321-1326-narada-native-to-data-adapter-foundation.md

## Goal

Implement a capability-gated local text excerpt reader for admitted Site roots.

## Context

The carrier may need small local text excerpts, but file readability must not collapse into Narada authority or secret access.

## Required Work

1. Require an explicit site_file_excerpt_read capability reference before reading local files.
2. Reject traversal outside the admitted Site root, binary files, oversized excerpts, secret-like paths, and files that require a stronger canonical reader.
3. Emit bounded_file_excerpt packets with path attribution, byte or line bounds, redaction posture, and no-mutation flags.
4. Add tests for path containment, size limits, binary refusal, secret-path refusal, and excerpt redaction posture.

## Non-Goals

- Do not implement broad filesystem browsing.
- Do not read credential stores, secret files, private keys, SQLite databases, or raw transcripts.
- Do not treat local file content as admitted Narada truth.

## Execution Notes

- Extended `tools/narada-native-carrier/to-data-readers.mjs` with `readBoundedFileExcerptToDataPacket`.
- The reader requires a `site_file_excerpt_read` capability reference before reading local files.
- The reader refuses traversal outside the admitted Site root, binary files, oversized excerpt bounds, secret-like paths, and governed state paths that require stronger canonical readers.
- Successful packets include bounded excerpts, path attribution, byte/line bounds, redaction posture, and the shared no-mutation flags.
- Extended `tools/narada-native-carrier/to-data-readers.test.mjs` with capability, containment, size, binary, secret-path, stronger-reader, bounded excerpt, attribution, and no-mutation coverage.
- Review continuation: fixed Windows absolute-path containment by rejecting `path.relative(siteRoot, absolutePath)` results that are absolute, covering cross-drive paths such as `C:\Windows\win.ini` from a `D:\code\narada` Site root.

## Verification

- `node --test tools\narada-native-carrier\to-data-readers.test.mjs` passed: 11 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 57 tests.
- `pnpm --filter @narada2/cli build` passed.
- Review continuation: `node --test tools\narada-native-carrier\to-data-readers.test.mjs` passed: 11 tests, including cross-drive absolute path refusal.
- Review continuation: `node --test tools\narada-native-carrier\*.test.mjs` passed: 58 tests.
- Review continuation: `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] The file reader is capability-gated and Site-root-contained.
- [x] Secret-like, binary, oversized, traversal, and stronger-reader paths are refused.
- [x] Tests prove excerpts are bounded, attributed, and non-mutating.
