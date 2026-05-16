---
status: closed
depends_on: [1420]
deferred_by: narada.architect
deferred_at: 2026-05-16T22:17:54.262Z
defer_reason: Cloudflare binding replacement requires operator-provided or governed-created Cloudflare deployment coordinates and Wrangler auth reference; current preflight is blocked by missing_wrangler_auth_reference and placeholder NARADA_SITE_REGISTRY_KV,NARADA_SITE_REGISTRY_D1 ids.
unblock_condition: Provide/confirm Cloudflare account id, zone id if routed, Worker script name, route/domain, D1 database name/id, KV namespace name/id, repo-visible coordinate consent, and Wrangler auth reference; then run narada task unblock 1425 --agent narada.architect --reason 'Cloudflare coordinates and auth reference are available as governed evidence'.
continuation_packet:
  kind: task_unblock
  unblocked_by: narada.architect
  unblocked_at: 2026-05-16T22:46:54.614Z
  evidence: Cloudflare D1/KV resources were created, wrangler.jsonc contains non-placeholder deployment coordinates, WRANGLER_AUTH_READY preflight passed, and no raw secrets are in config.
  rationale: Binding replacement blocker is satisfied by packages/site-registry-cloudflare/wrangler.jsonc and green deploy preflight.
  previous_unblock_condition: Provide/confirm Cloudflare account id, zone id if routed, Worker script name, route/domain, D1 database name/id, KV namespace name/id, repo-visible coordinate consent, and Wrangler auth reference; then run narada task unblock 1425 --agent narada.architect --reason 'Cloudflare coordinates and auth reference are available as governed evidence'.
unblocked_by: narada.architect
unblocked_at: 2026-05-16T22:46:54.614Z
unblock_evidence: Cloudflare D1/KV resources were created, wrangler.jsonc contains non-placeholder deployment coordinates, WRANGLER_AUTH_READY preflight passed, and no raw secrets are in config.
unblock_rationale: Binding replacement blocker is satisfied by packages/site-registry-cloudflare/wrangler.jsonc and green deploy preflight.
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T22:47:29.183Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by live wrangler.jsonc non-placeholder coordinates, green deploy preflight, and raw-secret/placeholder scan.
closed_at: 2026-05-16T22:47:35.057Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Prepare Cloudflare resource binding replacement

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1421-1430-site-telemetry-publication-live-readiness-followon.md

## Goal

Replace placeholder Cloudflare binding config only after concrete non-secret coordinates are available, or defer with exact blockers.

## Context

The package preflight currently fails on placeholder D1/KV binding ids. This task turns operator-provided Cloudflare resources into config evidence without performing live deploy.

## Required Work

1. Read the coordinate/secret posture artifact and current wrangler.example/live config posture.
2. If operator-provided Worker, route, D1, KV, account, and zone coordinates are available and allowed to be repo-visible, patch the intended wrangler config from placeholders to those coordinates.
3. If coordinates are missing or not admitted as repo-visible, do not guess; record a defer/blocker artifact with exact required values and the safe command to resume.
4. Verify that no raw secrets are present in config or git diff.
5. Run deploy preflight after any config change, expecting either ready or a narrowed non-coordinate blocker.

## Non-Goals

- Do not create Cloudflare resources unless a separate task explicitly grants that mutation.
- Do not deploy.
- Do not write raw secrets to repo files, logs, task reports, or artifacts.
- Do not invent resource ids or domains.

## Execution Notes

Inspected coordinate/secret posture and Wrangler config posture.

There is no `packages/site-registry-cloudflare/wrangler.jsonc` live config. The example config exists and still contains placeholder storage coordinates for `NARADA_SITE_REGISTRY_KV` and `NARADA_SITE_REGISTRY_D1`. No operator-provided Cloudflare account/zone/D1/KV/route coordinates were available in this session, so no config was patched.

Recorded blocker artifact: `.ai/decisions/2026-05-16-site-telemetry-cloudflare-binding-replacement-blocker.md`.

Resumed after operator grant. Created dedicated Cloudflare storage coordinates and added `packages/site-registry-cloudflare/wrangler.jsonc` with non-placeholder deployment coordinates:

- D1 `narada-site-registry`: `ef40bbb6-9f1e-4005-a2e4-b14636cd81b8`
- KV `NARADA_SITE_REGISTRY_KV`: `ef880946a3b24d28b95a280a6b72ecc2`
- account id: `aa93aee1fd6a15f4efc9832219ceea2c`

Updated `packages/site-registry-cloudflare/package.json` deploy scripts to use the live config. No raw secret values were written to config.

## Verification

- `Test-Path packages/site-registry-cloudflare/wrangler.jsonc` returned `False`.
- `Test-Path packages/site-registry-cloudflare/wrangler.example.jsonc` returned `True`.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:preflight` passed as a non-mutating preflight and reported `status=blocked`, `deploy_mutation_planned=false`, failing `wrangler_auth_reference_present` with `missing_wrangler_auth_reference`, and failing `storage_binding_ids_non_placeholder` for `NARADA_SITE_REGISTRY_KV,NARADA_SITE_REGISTRY_D1`.
- `WRANGLER_AUTH_READY=1 pnpm --filter @narada2/site-registry-cloudflare deploy:preflight` passed after live config creation with `status=ready`, no missing bindings, no placeholder bindings, `deploy_mutation_planned=false`, and `raw_secret_values_recorded=false`.
- `rg -n "<kv_namespace_id>|<d1_database_id>|NARADA_SITE_REGISTRY_(READ|PUBLISH|MESSAGE|POLL|LOCAL_ADMISSION|ADMIN)_TOKEN\\s*[:=]" packages/site-registry-cloudflare/wrangler.jsonc packages/site-registry-cloudflare/package.json` found no placeholder ids or raw secret assignments.

## Acceptance Criteria

- [x] Either concrete binding config is patched from admitted coordinates, or the task is deferred with exact missing coordinate blockers.
- [x] No placeholder D1/KV ids remain in the intended live config when the task closes as complete.
- [x] No raw secrets are recorded.
- [x] Deploy preflight output is recorded after the config decision.
