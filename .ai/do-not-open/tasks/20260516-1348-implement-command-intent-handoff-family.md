---
status: closed
depends_on: [1311, 1327]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:42:57.252Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by command-intent-handoff-family and carrier-action-packet focused tests recorded in task verification.
closed_at: 2026-05-16T03:45:46.214Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Implement command intent handoff family

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1345-1350-narada-native-governed-effect-handoff.md

## Goal

Implement inert CEIZ command run request drafts.

## Context

Command execution requires a governed command intent zone crossing, not direct carrier process spawn.

## Required Work

1. Represent argv vector, cwd, env policy, side-effect class, timeout, output admission profile, and rationale.
2. Use payload refs for bounded drafts.
3. Add tests proving no process spawn occurs and shell strings/env secrets are not persisted.

## Non-Goals

- Do not execute shell commands.
- Do not persist secret-bearing env values.
- Do not stringify argv into an unsafe shell command.

## Execution Notes

- Added `tools/narada-native-carrier/command-intent-handoff-family.mjs` for inert CEIZ command intent drafts.
- The payload represents bounded argv vector, cwd, env policy, side-effect class, timeout, output admission profile, rationale, and suggested canonical command-intent admission surface.
- The payload is written as a reconstructable JSON ref and wrapped in the generic carrier action packet with `action_family=command_intent`.
- The carrier records `process_spawned=false`, `shell_invoked=false`, and `direct_mutation_performed=false`.
- Added tests proving no process spawn, no shell invocation, no env secret persistence, and unsafe shell-string omission.

## Verification

- `node --test tools\narada-native-carrier\command-intent-handoff-family.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\carrier-action-packet.test.mjs` passed: 3 tests.

## Acceptance Criteria

- [x] Command intent packets match CEIZ draft posture.
- [x] No process is spawned by the carrier.
- [x] Tests prove env secrets and unsafe shell strings are not persisted.
