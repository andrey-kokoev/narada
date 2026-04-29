---
status: closed
amended_by: architect
amended_at: 2026-04-29T00:29:29.656Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-29T00:31:26.067Z
criteria_proof_verification:
  state: unbound
  rationale: Docs, schema/config generation, generated AGENTS contract, focused client/project bootstrap tests, typecheck, and pnpm verify all passed.
closed_at: 2026-04-29T00:32:06.106Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1060 — Declare Site participant roles at bootstrap

## Chapter

Site Participant Role Declarations

## Goal

Make Site bootstrap and governance coordinates declare value-producing and construction roles, including a non-Operator Resident role, without granting authority or capabilities by declaration.

## Context

Site bootstrap already oriented fresh Architect and Builder threads, but it did not declare the broader Site roles that participate in real inhabited operation. The missing role is the value-producing inhabitant: the person or participant who lives in or uses the Site to produce value. Calling that role Operator would collapse authority ownership with lived use, so this task introduces `resident`.

## Required Work

1. Add a Site governance coordinate for participant roles that is broader than AI thread bootstrap contracts.
2. Define `resident` as the value-producing Site inhabitant distinct from Operator authority.
3. Generate default participant role declarations for Resident, Architect, and Builder in contained Site configs.
4. Update generated AGENTS contracts so fresh AI threads see the Resident/Architect/Builder split without admitting extra AI bootstrap roles.
5. Add/update tests for generated client/project Site role declarations.

## Non-Goals

- Do not grant effect capability, task authority, or evidence admission merely because a role is declared.
- Do not admit Inspector or Receptionist as active default bootstrap roles.
- Do not change CLI role bootstrap support beyond existing Architect/Builder extraction.

## Execution Notes

1. Added `SiteParticipantRoleSchema` and `site_participant_roles` under Site governance coordinates.
2. Generated contained client/project Site configs now include active `resident`, `architect`, and `builder` participant role declarations with runtime and authority posture metadata.
3. Generated Site `AGENTS.md` now has a Site Participant Roles section and states that Resident is the value-producing inhabitant, not Operator authority.
4. Updated Site governance and bootstrap docs, plus Inhabited Evolution doctrine, to distinguish Resident, Operator, Architect, Builder, and Trace substrate.
5. Preserved bounded AI thread bootstrap: `sites agent-bootstrap` still supports only `architect` and `builder`.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/control-plane build` | Passed |
| `pnpm vitest run packages/layers/cli/test/commands/sites-client-bootstrap.test.ts packages/layers/cli/test/commands/sites-project-bootstrap.test.ts` | Passed: 2 files, 7 tests |
| `pnpm typecheck` | Passed |

## Acceptance Criteria

- [x] Site governance docs define site_participant_roles and Resident distinct from Operator authority
- [x] Generated Site config declares Resident Architect Builder participant roles
- [x] Generated AGENTS contract explains Resident and keeps Architect/Builder bootstrap bounded
- [x] Tests verify generated role declarations and unsupported agent bootstrap roles remain rejected
- [x] pnpm verify passes
