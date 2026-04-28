---
status: closed
amended_by: architect
amended_at: 2026-04-28T14:48:18.378Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T14:48:26.221Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented and verified Site immune sensing v1: doctrine, CLI command, tamper predicates, focused tests 4/4, CLI typecheck pass, CLI build pass, live scan no tamper_suspected.
closed_at: 2026-04-28T14:48:38.651Z
closed_by: architect
governed_by: task_close:architect
closure_mode: peer_reviewed
---

# Task 1027: Add Site immune sensing scan

## Goal

Add a read-only Site immune sensing surface that detects tamper-suspected authority-zone posture without autonomous repair.

## Context

<!-- Context placeholder -->

## Required Work

1. Document Site immune sensing as an observe/classify/report zone, not a repair authority.
2. Add a finite CLI surface for Site immune scans.
3. Detect malformed Site-shaped config as tamper-suspected.
4. Detect malformed mutation evidence as tamper-suspected.
5. Warn when task lifecycle SQLite and exported snapshot posture diverge.
6. Keep scanner output bounded and command-mediated.
7. Add focused tests.

## Non-Goals

- Do not repair, delete, quarantine, roll back, or rewrite authority surfaces.
- Do not make the immune scanner a second authority.
- Do not perform external effects.
- Do not create derivative task-status files.

## Execution Notes

1. Added `docs/concepts/site-immune-sensing.md` defining Site immune sensing as a read-only observation zone.
2. Linked the doctrine from `AGENTS.md`.
3. Added `siteImmuneScanCommand` with status `ok`, `attention`, or `tamper_suspected`.
4. Added scanner predicates for Site config, task lifecycle DB/snapshot posture, mutation-evidence validation, and authority-registry JSON parsing.
5. Wired `narada sites immune scan` under the `sites` command group.
6. Ensured findings return sanctioned next commands where available and never perform repair.
7. Added focused tests for clean posture, malformed config, malformed mutation evidence, and missing lifecycle snapshot.
8. Ran the scanner against Narada proper; it reported attention only for expected stale lifecycle snapshot after task mutations, with no tamper-suspected findings.

## Verification

| Command | Result |
|---------|--------|
| `pnpm --filter @narada2/cli exec vitest run test/commands/site-immune-scan.test.ts` | Pass: 4/4 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |
| `narada sites immune scan --cwd . --format json` | Attention only; no tamper-suspected findings; posture stayed observe/classify/report only |

## Acceptance Criteria

- [x] Doctrine documents immune sensing as observe/classify/report only.
- [x] CLI exposes `narada sites immune scan`.
- [x] Scanner detects malformed config as tamper-suspected.
- [x] Scanner detects malformed mutation evidence as tamper-suspected.
- [x] Scanner warns on lifecycle DB without exported snapshot.
- [x] Focused tests pass.
- [x] CLI typecheck passes.
- [x] CLI build passes.
