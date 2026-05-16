---
status: closed
depends_on: [1382]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T16:40:47.125Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T16:40:47.571Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Add hosted registry deployment and smoke verification runbook

## Chapter

Cloudflare hosted Site Registry projection

## Goal

Create the deployment, migration, secret, and smoke verification path for the hosted Site Registry Worker.

## Context

Staccato documents npm deploy, wrangler secret put, D1 create, D1 migrations apply, local send, scheduled publisher, and inbox pull. Narada needs an equivalent runbook and smoke script that can prove readiness without automatically deploying.

## Required Work

1. Add a deployment runbook for Worker deploy, D1 creation/migrations, KV namespace setup, secret binding, and rollback. 2. Add migration files or schema docs for projection, event log, message, receipt, and capability audit tables. 3. Add a non-live smoke script or test fixture that verifies routes, auth refusal, accepted event, read projection, message submit, poll, finalize, and receipt. 4. Add explicit live deployment checklist requiring operator capability grant, account/zone ids, secret values, and post-deploy verification. 5. Ensure docs do not claim production readiness before live evidence.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Added `docs/deployment/cloudflare-hosted-site-registry.md` with the gated deployment runbook for Worker setup, KV, D1, migrations, secrets, non-live smoke, live deploy, post-deploy smoke, rollback, and readiness posture. The runbook explicitly requires operator capability grant and concrete Cloudflare ids/secrets outside committed evidence before live deployment.

Added `packages/site-registry-cloudflare/migrations/README.md` documenting the D1 schema and KV/D1 authority posture. Added `smoke:fixture` package script and an integrated non-live smoke test covering health, auth refusal, accepted event projection, protected projection read, message submit, pending poll, finalization, and receipt read without live network or secrets.

The docs do not claim production readiness; they gate readiness on live deploy evidence and the final readiness proof task.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare smoke:fixture` passed: 1 test.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 3 test files, 25 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Deployment runbook covers Wrangler config, D1/KV setup, secrets, migrations, deploy, rollback, and smoke verification.
- [x] Smoke proof can run locally or against a provided URL without exposing secrets.
- [x] Live deployment remains a gated operator action with concrete evidence requirements.
