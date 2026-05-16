---
status: closed
depends_on: [1420]
deferred_by: narada.architect
deferred_at: 2026-05-16T22:20:46.600Z
defer_reason: Site config connection is blocked because no hosted deployed and receiving-verified telemetry surface exists; task 1428 post-deploy smoke is deferred.
unblock_condition: Close task 1427 with deployment evidence, close task 1428 with post-deploy smoke evidence and readiness at least receiving_verified, admit the owning Site/publication edge, then identify the Narada proper Site config authority locus before mutation.
continuation_packet:
  kind: task_unblock
  unblocked_by: narada.architect
  unblocked_at: 2026-05-16T22:51:34.709Z
  evidence: .ai/decisions/2026-05-16-site-telemetry-live-deployment-evidence.md records deployed Worker, live smoke, deploy:verify, and .narada/site.json config connection verification.
  rationale: The deferred blocker is satisfied: a receiving-verified hosted telemetry surface exists and Narada proper Site config has been connected without raw secrets.
  previous_unblock_condition: Close task 1427 with deployment evidence, close task 1428 with post-deploy smoke evidence and readiness at least receiving_verified, admit the owning Site/publication edge, then identify the Narada proper Site config authority locus before mutation.
unblocked_by: narada.architect
unblocked_at: 2026-05-16T22:51:34.709Z
unblock_evidence: .ai/decisions/2026-05-16-site-telemetry-live-deployment-evidence.md records deployed Worker, live smoke, deploy:verify, and .narada/site.json config connection verification.
unblock_rationale: The deferred blocker is satisfied: a receiving-verified hosted telemetry surface exists and Narada proper Site config has been connected without raw secrets.
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T22:52:21.383Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by .narada/site.json connection, config/package tests, deploy:verify, and live deployment evidence; no raw secrets recorded.
closed_at: 2026-05-16T22:52:43.872Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Connect Narada Site config to verified telemetry surface

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1421-1430-site-telemetry-publication-live-readiness-followon.md

## Goal

Create the separate governed Site configuration mutation that points Narada proper at the verified hosted telemetry surface.

## Context

Deploying a receiver does not mean any Site trusts or uses it. Site config connection is a separate authority crossing after smoke verification.

## Required Work

1. Verify post-deploy smoke and readiness evidence for the declared surface.
2. Identify the exact Narada proper Site config authority locus and the config fields for telemetry destination/publication edge.
3. Patch Site config to reference the verified telemetry surface URL and capability refs only if the owning Site and publication edge are admitted.
4. Run the appropriate config/schema/readiness verification commands.
5. Record evidence that deployment, receiving verification, and config connection remained distinct crossings.

## Non-Goals

- Do not connect config before smoke verification.
- Do not configure broad multi-Site federation by default.
- Do not embed raw secrets in Site config.
- Do not treat Cloudflare route existence as local admission authority.

## Execution Notes

Site config connection is blocked because no hosted deployed, receiving-verified telemetry surface exists. Task 1428 is deferred and readiness remains `smoke_ready` locally, not `hosted_deployed`, not `receiving_verified`, and not `live_deployed`.

Recorded blocker artifact: `.ai/decisions/2026-05-16-site-telemetry-site-config-connection-blocked.md`.

Narada proper Site config was not patched. No telemetry destination was connected, no publication edge was activated, and no raw secrets were embedded.

Resumed after live deployment and post-deploy smoke. Target locus for the governed config mutation was Narada proper Site config at `.narada/site.json`.

Patched `.narada/site.json` with:

- `site_telemetry.telemetry_destinations[0]` for `narada-proper-site-telemetry-publication-v0`
- Cloudflare Worker endpoint `https://narada-site-registry.andrei-kokoev.workers.dev/webhook`
- health endpoint `https://narada-site-registry.andrei-kokoev.workers.dev/health`
- capability references only, not raw secret values
- `publication_edge` recording publisher/owner `narada-proper`, Worker secret resolver posture, evidence refs, and readiness trust posture `smoke_verified`

Deployment, smoke verification, and Site config connection remained separate crossings in the recorded evidence. The connected surface is hosted and receiving verified on Workers.dev; it is not custom-domain-routed and not yet operationally monitored.

## Verification

- `rg -n "not hosted_deployed|not receiving_verified|not live_deployed|Post-deploy smoke cannot run|Site config unchanged" .ai/decisions/2026-05-16-site-telemetry-post-deploy-smoke-blocked.md docs/product/site-telemetry-readiness.v0.md docs/product/site-telemetry-first-live-slice.v0.md` passed; readiness and smoke blockers prove config connection is premature.
- `node -e "JSON.parse(require('node:fs').readFileSync('.narada/site.json','utf8')); console.log('site_json_valid')"` passed.
- `pnpm --filter @narada2/site-config test` passed, 22 tests.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed, 37 tests.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url https://narada-site-registry.andrei-kokoev.workers.dev` passed with health 200 and `raw_secret_values_recorded=false`.
- `.ai/decisions/2026-05-16-site-telemetry-live-deployment-evidence.md` records Cloudflare coordinates, secret posture, smoke evidence, config connection, and authority limits.

## Acceptance Criteria

- [x] Narada proper Site config references the verified telemetry surface only after prerequisite evidence.
- [x] Config verification passes or exact blockers are recorded.
- [x] Raw secrets are absent from config and evidence.
- [x] The task records deployment, smoke verification, and config connection as separate governed crossings.
