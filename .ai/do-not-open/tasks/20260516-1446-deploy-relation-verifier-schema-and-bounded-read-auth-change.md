---
status: closed
depends_on: [1440]
closed_at: 2026-05-17T00:10:56.789Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Deploy relation verifier schema and bounded read/auth changes

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1441-1447-site-registry-relation-capability-verifiers.md

## Goal

Apply the relation verifier implementation to Cloudflare only after tests and live preflight prove the deployment is bounded.

## Context

Deployment must not silently create or rotate secrets. Cloudflare D1 migration and Worker deploy are publication effects requiring explicit evidence.

## Required Work

1. Run package tests, build, smoke fixture, and Wrangler dry-run/preflight.
2. Apply the verifier D1 migration remotely only after confirming pending migrations.
3. Deploy the Worker and record version id.
4. Run bounded live verification for health, public sites, invalid/refused transition posture, and no pending migrations.
5. Do not create live verifier secrets or withdraw live Sites unless a separate gated enrollment/transition proof is explicitly admitted.

## Non-Goals

- Do not set arbitrary live Site withdrawal secrets as part of deploy.
- Do not withdraw `narada-proper` by default.
- Do not claim live verifier enrollment unless performed and verified under its own gate.

## Execution Notes

- Confirmed task 1446 is assigned to `narada.builder2`.
- Read the Site Registry Cloudflare package docs, deploy wrapper, deploy
  readiness helper, live `wrangler.jsonc`, and migrations.
- Ran package tests, build, non-live relation lifecycle smoke fixture, and
  deploy preflight before any live Cloudflare mutation.
- Deploy preflight was blocked because no Wrangler auth reference was present
  in the environment. Storage bindings are declared and non-placeholder, and
  secret refs are withheld from config.
- Because preflight was blocked, no remote D1 migration was applied, no Worker
  deploy was attempted, and no live route verification was performed.
- Ran the live deploy wrapper without approval env; it stopped at the explicit
  gate with `deploy_mutation_performed: false` before invoking Wrangler deploy.
- Checked deployment-related environment posture:
  `wrangler_auth_ref_missing`, `deploy_approval_missing`, and
  `live_relation_mutation_disabled`.
- No live verifier secrets were created or rotated.
- No live Site withdrawal occurred, including `narada-proper`.
- Residual live steps remain explicit: provide Wrangler auth/approval evidence,
  list pending remote D1 migrations, apply only the pending verifier migration,
  deploy Worker, record version id, run bounded live health/public-sites/refusal
  checks, and confirm no pending migrations after deploy.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 4 files, 52
  tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `pnpm --filter @narada2/site-registry-cloudflare smoke:fixture` passed: 3
  tests.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:preflight` returned
  `status: "blocked"` with `missing_wrangler_auth_reference`,
  `deploy_mutation_planned: false`, storage bindings declared,
  non-placeholder binding ids, and `raw_secret_values_recorded: false`.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:live` returned the
  expected gate block:
  `live_deploy_requires_--live_and_NARADA_SITE_TELEMETRY_DEPLOY_APPROVED=1`,
  `deploy_mutation_performed: false`, and
  `raw_secret_values_recorded: false`.
- Environment checks showed no Wrangler auth reference, no deploy approval, and
  live relation mutation disabled.
- `pnpm verify` failed at the pre-existing unrelated CLI output admission guard
  in `sites-register.ts` lines 69, 85, and 141; task file guard passed.

## Acceptance Criteria

- [x] Remote D1 migration and Worker deploy evidence are recorded if deployment occurs.
- [x] Live public registry remains projection-only and bounded.
- [x] No live Site withdrawal occurs by default.
- [x] Residual live enrollment steps are explicit.
