---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T23:04:42.166Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by public API before/after evidence, Wrangler config patch, green preflight/tests, live deploy, and deploy:verify; no telemetry was forged.
closed_at: 2026-05-16T23:04:53.018Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Repair hosted Site Registry placeholder known Site expectation

## Goal

Remove the placeholder `user-site` expectation from the live Narada proper hosted Site Registry configuration so public freshness reflects only admitted known Site expectations.

## Context

The hosted registry page reports `site_count: 2` with `missing_count: 1`. Public API inspection shows the missing Site is `user-site`, which comes from `packages/site-registry-cloudflare/wrangler.jsonc` `NARADA_SITE_REGISTRY_KNOWN_SITE_IDS`. No evidence admits a real Site with id `user-site` into this Narada proper publication surface. Treating it as expected makes the live registry less coherent.

## Required Work

1. Confirm the live missing projection is `user-site` and that it is sourced from the deployed known-site config.
2. Decide the bounded repair: remove `user-site` from the live config rather than publishing forged telemetry for a Site Narada proper does not own.
3. Patch the live Wrangler config to list only admitted known Site ids for this first slice.
4. Run preflight/tests/deploy verification and, if config changed, redeploy the Worker under the existing operator-granted deployment posture.
5. Verify `/api/sites` and `/api/freshness` no longer report a placeholder missing Site.
6. Record evidence and residuals, including that a future real User Site must be admitted explicitly before being counted.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Live public API inspection confirmed the missing Site was `user-site`:

- `GET /api/sites`: `site_count=2`, `fresh_count=1`, `missing_count=1`
- missing projection: `site_id=user-site`

The source was `packages/site-registry-cloudflare/wrangler.jsonc`
`NARADA_SITE_REGISTRY_KNOWN_SITE_IDS=narada-proper,user-site`.

Repaired by narrowing the live known-site list to `narada-proper`, and applying
the same non-placeholder first-slice default to `wrangler.example.jsonc`.

Redeployed the Worker under the existing operator-granted deployment posture.
New observed Worker version: `40844adf-592c-41d5-bd50-6720126c77b4`.

After repair, public registry summary reports:

```json
{
  "site_count": 1,
  "fresh_count": 1,
  "stale_count": 0,
  "missing_count": 0,
  "failing_count": 0
}
```

No telemetry was forged for `user-site`. No new User Site relation was admitted.

Evidence artifact:
`.ai/decisions/2026-05-16-site-registry-known-site-placeholder-repair.md`

## Verification

- `Invoke-RestMethod https://narada-site-registry.andrei-kokoev.workers.dev/api/sites` before repair identified `user-site` as the only missing projection.
- `rg -n "NARADA_SITE_REGISTRY_KNOWN_SITE_IDS|user-site" packages/site-registry-cloudflare ...` tied the placeholder to Wrangler config.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:preflight` passed.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed, 37 tests.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:live` passed and deployed version `40844adf-592c-41d5-bd50-6720126c77b4`.
- `Invoke-RestMethod https://narada-site-registry.andrei-kokoev.workers.dev/api/sites` after repair returned `site_count=1`, `fresh_count=1`, `missing_count=0`.
- `Invoke-RestMethod https://narada-site-registry.andrei-kokoev.workers.dev/api/freshness` after repair returned only `narada-proper`.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url https://narada-site-registry.andrei-kokoev.workers.dev` passed.

## Acceptance Criteria

- [x] The public missing Site is identified and tied to config evidence.
- [x] The live config no longer contains the placeholder `user-site` expectation.
- [x] The Worker is redeployed or exact blocker is recorded.
- [x] Public registry summary no longer reports the placeholder as missing.
- [x] No telemetry is forged for a Site outside Narada proper authority.
