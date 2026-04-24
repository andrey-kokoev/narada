---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T16:30:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [585, 586, 587]
artifact: .ai/decisions/20260424-588-direct-access-prohibition-and-sanctioned-substrate-contract.md
---

# Task 588 - Direct-Access Prohibition And Sanctioned-Substrate Contract

## Goal

Define the prohibition regime that removes direct markdown and SQLite access from normal task operations, while making explicit the few cases where low-level access may still be sanctioned.

## Context

The target state has four strong prohibitions:

- no direct task editing
- no direct task reading
- no direct task creation
- no direct SQLite access for task operations

Those prohibitions are easy to state but still ambiguous unless Narada makes explicit:

- what counts as "direct",
- what counts as "task operation",
- what exceptions exist,
- and how sanctioned maintenance differs from ordinary task work.

## Required Work

1. Define the exact meaning of:
   - direct task editing
   - direct task reading
   - direct task creation
   - direct SQLite access for task operations
2. Define what counts as a sanctioned command for task operations.
3. State the substrate rule explicitly:
   - markdown and SQLite are implementation substrates,
   - not direct working surfaces,
   - and not direct authorities for operator/agent task interaction.
4. Define the bounded exception classes, if any, at minimum considering:
   - migration/bootstrap windows
   - low-level repair of broken command surfaces
   - forensic/debug access
   - export/import
   Make explicit whether the normal operator/agent standing for direct substrate access is:
   - none,
   - or something narrower.
   Do not leave ordinary standing implicit.
5. For each exception class, define:
   - who has standing
   - what authority class it requires
   - whether it is read-only or mutating
   - what audit trail is required
6. Define the target enforcement posture:
   - lint
   - operator guards
   - filesystem/database permission posture
   - command-only UX
   - and whether sanctioned commands themselves are allowed to expose raw markdown or raw SQLite payloads.
7. State what remains deliberately out of scope for the first implementation line.
8. Record verification or bounded blockers.

## Non-Goals

- Do not smuggle broad "developer convenience" exceptions back into the normal regime.
- Do not equate debug access with ordinary task work.
- Do not leave exception standing implicit.

## Execution Notes

### Artifact

Written `.ai/decisions/20260424-588-direct-access-prohibition-and-sanctioned-substrate-contract.md` (~16 KB) covering:
- Four precise prohibition definitions (editing, reading, creation, SQLite access) with specific examples of prohibited and not-prohibited actions
- Substrate rule: markdown/SQLite/JSON are substrates, not working surfaces or authorities
- Sanctioned command definition (6 criteria)
- Six bounded exception classes with full attribute tables (purpose, standing, read/mutate, authority, audit trail, time-bounded, examples)
- Normal standing for direct substrate access: **none**
- Five-layer enforcement posture (lint, operator guards, filesystem permissions, command-only UX, payload restrictions)
- Five items deliberately out of scope for first implementation line
- Verification evidence and bounded blockers (5 residual gaps with mitigations)

### Verification

- `pnpm typecheck` — all 11 packages clean ✅
- Decision artifact exists and defines complete prohibition regime ✅
- All four prohibitions precise with specific examples ✅
- Six exception classes explicit with standing and authority ✅
- Enforcement posture covers 5 layers, 3 already active ✅

## Acceptance Criteria

- [x] All four direct-access prohibitions are defined precisely
- [x] Sanctioned command meaning is explicit
- [x] Substrate rule is explicit
- [x] Exception classes and standing are explicit
- [x] Target enforcement posture is explicit
- [x] Verification or bounded blocker evidence is recorded
