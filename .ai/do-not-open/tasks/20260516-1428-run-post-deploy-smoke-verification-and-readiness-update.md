---
status: closed
depends_on: [1420]
deferred_by: narada.architect
deferred_at: 2026-05-16T22:20:08.735Z
defer_reason: Post-deploy smoke cannot run because no hosted deployment exists: task 1427 is deferred with no deploy command run and task 1426 preflight is blocked.
unblock_condition: Close task 1427 with bounded hosted deployment evidence, including declared route, Worker/version, D1/KV binding refs, and migration refs; then run post-deploy smoke verification.
continuation_packet:
  kind: task_unblock
  unblocked_by: narada.architect
  unblocked_at: 2026-05-16T22:49:02.836Z
  evidence: Hosted deployment exists at https://narada-site-registry.andrei-kokoev.workers.dev and live smoke passed: health 200, protected refusal 401, valid event accepted, projection ok, remote candidate submitted/finalized/receipt admitted, token_echo_detected=false.
  rationale: The prior no-deployment blocker is resolved by task 1427 deployment evidence and live smoke evidence.
  previous_unblock_condition: Close task 1427 with bounded hosted deployment evidence, including declared route, Worker/version, D1/KV binding refs, and migration refs; then run post-deploy smoke verification.
unblocked_by: narada.architect
unblocked_at: 2026-05-16T22:49:02.836Z
unblock_evidence: Hosted deployment exists at https://narada-site-registry.andrei-kokoev.workers.dev and live smoke passed: health 200, protected refusal 401, valid event accepted, projection ok, remote candidate submitted/finalized/receipt admitted, token_echo_detected=false.
unblock_rationale: The prior no-deployment blocker is resolved by task 1427 deployment evidence and live smoke evidence.
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T22:51:13.676Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by live smoke and deploy:verify evidence; no raw secrets/private payloads recorded.
closed_at: 2026-05-16T22:51:23.444Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Run post-deploy smoke verification and readiness update

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1421-1430-site-telemetry-publication-live-readiness-followon.md

## Goal

Verify the deployed surface behavior and update readiness evidence according to the Site Telemetry readiness state machine.

## Context

Hosted deployment does not equal live readiness. The surface must prove health, protected route behavior, projection-only authority, and bounded receiver behavior.

## Required Work

1. Run post-deploy smoke verification against the declared route without recording raw tokens or payload secrets.
2. Verify health, version/capabilities if present, protected-route refusal, valid bounded telemetry intake, invalid intake refusal, SiteRegistry read projection, remote candidate submit/pending/detail/finalize/receipt posture, and no token echo.
3. Record smoke proof refs and readiness state supported by evidence, distinguishing hosted_deployed, receiving_verified, publishing_verified, operationally_monitored, and live_deployed.
4. If smoke fails, record failure evidence and leave Site config unchanged.
5. Record rollback recommendation if the deployed surface is unsafe or incoherent.

## Non-Goals

- Do not mutate local Site config.
- Do not publish real private telemetry unless a publisher edge has separate authority.
- Do not finalize local admission except through an explicit local admission reference.
- Do not perform destructive rollback without explicit operator grant.

## Execution Notes

Post-deploy smoke cannot run because no hosted deployment exists. Task 1427 is deferred with no deploy command run, and task 1426 is deferred with blocked preflight.

Recorded blocker artifact: `.ai/decisions/2026-05-16-site-telemetry-post-deploy-smoke-blocked.md`.

No Site config mutation, private telemetry publication, local admission finalization, rollback, raw secret recording, commit, or push was performed.

Resumed after live deployment. Generated Worker bearer secrets in process memory, stored them as Cloudflare Worker Secrets, and ran live smoke against `https://narada-site-registry.andrei-kokoev.workers.dev`.

Smoke passed:

- health status `scaffold`
- all required Worker secret configured booleans `true`
- invalid publish request returned `401`
- valid telemetry event accepted and projection recorded
- `/api/sites` returned site count `2`
- Narada proper projection returned `ok`
- remote candidate submitted, appeared pending, finalized as admitted, and receipt returned admitted
- token echo detected: `false`

## Verification

- `rg -n "not hosted_deployed|not live_deployed|No live Cloudflare deploy|No deploy command was run|deploy-blocked" .ai/decisions/2026-05-16-site-telemetry-live-deploy-not-admissible.md .ai/decisions/2026-05-16-site-telemetry-deploy-preflight-blocked.md docs/product/site-telemetry-readiness.v0.md` passed; deployment blockers and readiness limits confirm there is no live surface to smoke verify.
- Live smoke PowerShell harness passed with bounded output: health `scaffold`, invalid publish `401`, event `accepted`, projection recorded `true`, projection `ok`, message `submitted`, finalize `admitted`, receipt `admitted`, `token_echo_detected=false`.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url https://narada-site-registry.andrei-kokoev.workers.dev` passed with `status=verified`, `health_status=200`, `mode=projection_only`, and `raw_secret_values_recorded=false`.

## Acceptance Criteria

- [x] Post-deploy smoke evidence is recorded.
- [x] Readiness state is updated only to the level supported by evidence.
- [x] Failures leave Site config unchanged and produce bounded rollback/residual guidance.
- [x] No raw secrets or private telemetry payloads are recorded.
