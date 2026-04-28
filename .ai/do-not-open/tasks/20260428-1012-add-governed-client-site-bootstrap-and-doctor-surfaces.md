---
status: closed
amended_by: architect
amended_at: 2026-04-28T01:59:54.239Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T02:00:00.213Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, CLI smoke checks, execute/doctor temp workspace probe, and pnpm verify prove the client Site bootstrap acceptance criteria.
closed_at: 2026-04-28T02:00:01.385Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add governed client Site bootstrap and doctor surfaces

## Chapter

Client Site Bootstrap Ergonomics

## Goal

Provide command-mediated client Site bootstrap and validation surfaces that absorb the Utz bootstrap friction without direct manual directory/file setup.

## Context

The Utz setup showed that client-service Site creation is now conceptually stable but still too manual: create contained `.narada`, install canonical inbox file-drop/export folders, write guidance, validate config/folder posture, and keep OneDrive/non-Git posture distinct from Git-backed Sites. The Site doctor implementation also existed but was not exposed on the `narada sites` CLI surface.

## Required Work

1. Add a governed client Site bootstrap command with dry-run default and explicit execute mode.
2. The dry-run plan must list directories/files to create, inbox posture, sync posture, and validation commands without mutation.
3. Execute mode must create a contained `.narada` Site under an explicit client workspace root.
4. The created structure must include canonical inbox file-drop/export folders and guidance files needed for first use.
5. Expose a Site doctor surface on the `narada sites` CLI.
6. Add doctor validation for client Site config, required folders, inbox drop/export posture, path rendering, and non-Git/OneDrive-safe durability posture.
7. Document the client Site bootstrap and validation workflow.
8. Add focused tests for dry-run, execute structure creation, doctor pass/fail checks, and CLI registration.
9. Promote the inbox observation to this task and close with evidence.

## Non-Goals

- Do not initialize Git for client Sites by default.
- Do not model service/data/ELT Site routing beyond validating bootstrap posture.
- Do not mutate external systems.
- Do not touch the unrelated untracked `staccato-client-service` directory.

## Execution Notes

1. Added `sitesBootstrapClientCommand` in `packages/layers/cli/src/commands/sites.ts`.
2. Registered `narada sites bootstrap-client` with `--workspace`, optional `--site-id`, optional `--sync`, dry-run default, and `--execute` mutation mode.
3. The dry-run plan reports the contained `.narada` root, directories, files, sync posture, canonical inbox posture, config, and validation commands.
4. Execute mode creates `.narada/config.json`, README, AGENTS guidance, canonical `.ai/inbox-drop` and `.ai/inbox-envelopes`, `.gitkeep` markers, and durable governance folders.
5. Exposed `narada sites doctor <site-id>` and added `--kind client` validation.
6. Client doctor validates config parse, Site identity, Site kind, workspace root, durability posture, OneDrive non-Git posture, required folders, canonical inbox folders, and empty-directory markers.
7. Updated `docs/product/site-bootstrap-contract.md` with client Site bootstrap and doctor workflow.
8. Added `packages/layers/cli/test/commands/sites-client-bootstrap.test.ts` covering dry-run, execute, doctor pass, and doctor failure when inbox drop is missing.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter @narada2/cli exec vitest run test/commands/sites-client-bootstrap.test.ts test/commands/sites-init.test.ts` | Pass, 19/19 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |
| `narada sites bootstrap-client --help` | Pass; command is exposed |
| Bounded dry-run probe for `narada sites bootstrap-client --workspace <tmp> --site-id utz --format json` | Pass; returned dry-run plan without writing |
| Execute and doctor smoke with temp workspace | Pass; execute created `.narada`, `narada sites doctor utz --kind client --root <tmp>` returned `passed` with 20 checks |
| `pnpm verify` | Pass, all 8 steps |

## Acceptance Criteria

- [x] CLI exposes a client Site bootstrap command.
- [x] CLI exposes Site doctor validation for Site roots.
- [x] Dry-run previews directories, files, inbox posture, sync posture, and validation commands without writing.
- [x] Execute mode creates contained `.narada` client Site structure under an explicit workspace root.
- [x] Created Site includes canonical inbox file-drop and exported-envelope folders.
- [x] Doctor validates config, required folders, inbox drop/export posture, path rendering, and non-Git/OneDrive-safe durability posture.
- [x] Inbox observation is promoted to this work.
- [x] Focused tests and `pnpm verify` pass.
