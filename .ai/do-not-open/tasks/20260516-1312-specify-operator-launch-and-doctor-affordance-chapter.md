---
status: confirmed
depends_on: [1301, 1302, 1303, 1304, 1305]
closed_at: 2026-05-16T00:44:22.021Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify operator launch and doctor affordance chapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1306-1313-narada-native-carrier-future-chapter-commissioning.md

## Goal

Create a structured build chapter for operator-facing Narada-native launch, readiness, and doctor affordances.

## Context

Operators need to see whether Narada-native is configured, blocked, fixture-only, provider-backed, or live without reading private implementation files.

## Required Work

1. Inspect existing agent-start, supervisor doctor, readiness, and operator-surface patterns.
2. Define launch and doctor commands or surfaced affordances for Narada-native sessions.
3. Specify bounded output fields for provider posture, data posture, consent posture, runtime posture, and latest evidence refs.
4. Include tests proving command output is bounded and does not expose raw secrets, prompts, or model output.
5. Submit structured chapter input with ordered build tasks.

## Non-Goals

- Do not make launch affordances an authority locus.
- Do not expose raw provider configuration or credential values.
- Do not require an operator UI rewrite.

## Execution Notes

- Inspected agent-start launch planning, Narada-native supervisor CLI, and Operator Surface doctrine. Existing launch packets already describe Narada-native as planned/not executed with withheld capabilities; supervisor doctor exposes bounded session readback.
- Boundary decision: launch and doctor affordances are operator-facing projections and entrypoints. They do not become authority loci, grant capabilities, expose credentials, or prove task/effect truth by being visible.

## Structured Chapter Input

Chapter: `narada-native-operator-launch-doctor-affordances`

Goal: Provide operator-facing Narada-native launch, readiness, and doctor surfaces with bounded output for configured, blocked, fixture-only, provider-backed, and live states.

Ordered implementation tasks:

1. `Define Narada-native launch command posture`
   - Extend `agent-start` Narada-native runtime output from planned-only toward admitted dry-run/live launch planning.
   - Fields: runtime kind, carrier session id, startup command, capability posture, withheld authorities, launch evidence refs, and execution admission state.
   - Verification: launch dry-run output contains no raw secrets, prompts, provider config values, or model output.

2. `Define Narada-native doctor command`
   - Operator command wraps supervisor doctor/readiness and returns compact JSON/human output.
   - Fields: runtime posture, provider posture, data posture, consent posture, blocked reasons, latest evidence refs, reconstruction status, next diagnostic command.
   - Verification: states distinguish configured, blocked, fixture-only, provider-backed, live-running, failed, and stopped.

3. `Add bounded evidence-ref projection`
   - Doctor output lists evidence refs by family/status/path only; no raw transcript, prompt, provider output, or credential values.
   - Verification: tests with secret-like fixture data prove output omits raw values.

4. `Add operator-surface affordance projection`
   - Surface labels/buttons may show launch/doctor availability and current posture, but must point to canonical commands rather than mutating directly.
   - Verification: projection tests prove launch/focus convenience does not imply authority or capability grants.

5. `Add repair guidance and refusal posture`
   - Missing registration, missing consent, revoked grant, missing runtime, stale heartbeat, and unavailable provider transport produce bounded repair guidance.
   - Verification: tests cover each blocked state and ensure no automatic repair mutation occurs.

6. `Add end-to-end operator readback proof`
   - Dry-run launch, start/heartbeat evidence, doctor readback, and reconstruction are linked by carrier session id.
   - Verification: proof covers fixture and provider-configured paths without live provider network calls.

Residuals:

- Full UI rewrite is out of scope; this chapter should expose command/readback affordances first.
- Runtime handle binding remains governed by Operator Surface runtime-locus rules and should not infer volatile handles from labels.

## Verification

- Inspected `tools\agent-start\start-agent.mjs`.
- Inspected `tools\narada-native-carrier\supervisor-cli.mjs`.
- Inspected `docs\concepts\operator-surface.md`.

## Acceptance Criteria

- [x] The proposal defines clear operator-facing launch and doctor surfaces.
- [x] Output distinguishes configured, blocked, fixture-only, provider-backed, and live states.
- [x] Evidence refs are bounded and reconstructable.
- [x] The chapter is ready for governed commission.
