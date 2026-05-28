---
status: closed
depends_on: [1312, 1339]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:46:04.536Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by launch-command-posture and live-start focused tests recorded in task verification.
closed_at: 2026-05-16T03:47:08.046Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Define Narada-native launch command posture

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1351-1356-narada-native-operator-launch-doctor-affordances.md

## Goal

Extend operator-facing Narada-native launch output toward admitted dry-run and live launch planning.

## Context

Launch affordances are projections and entrypoints, not authority loci.

## Required Work

1. Expose runtime kind, carrier session id, startup command, capability posture, withheld authorities, launch evidence refs, and execution admission state.
2. Support dry-run launch planning without executing live providers.
3. Add tests proving launch output contains no raw secrets, prompts, provider config values, or model output.

## Non-Goals

- Do not make launch visibility a capability grant.
- Do not infer volatile handles from labels.
- Do not require an operator UI rewrite.

## Execution Notes

- Added `tools/narada-native-carrier/launch-command-posture.mjs` for bounded Narada-native launch output.
- Launch posture exposes runtime kind/handle, carrier session id, startup command, capability posture, withheld authorities, launch evidence refs, and execution admission state.
- Dry-run planning is represented by `execution_admission_state=dry_run_planned_not_admitted` without live provider transport or Narada mutation.
- Launch evidence refs are bounded and secret-like refs are omitted.
- Added tests proving bounded runtime/session/capability/authority/evidence fields, dry-run planning, no live provider calls, and redacted non-authoritative output.

## Verification

- `node --test tools\narada-native-carrier\launch-command-posture.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\live-start.test.mjs` passed: 4 tests.

## Acceptance Criteria

- [x] Launch output has bounded runtime, session, capability, authority, and evidence fields.
- [x] Dry-run planning is available without live provider calls.
- [x] Tests prove output is redacted and non-authoritative.
