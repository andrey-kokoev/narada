---
status: claimed
depends_on: [1412]
---

# Implement hosted telemetry deploy wrapper and verifier

## Chapter

Site Telemetry Publication / Readiness And Operations

## Goal

Implement non-secret deploy wrapper and hosted verifier modeled on Staccato.

## Context

Implements hosted telemetry deploy wrapper/verifier without publishing unless explicitly invoked by an operator.

## Required Work

1. Inspect current wrangler scripts, package scripts, and readiness requirements from task 1412.
2. Add a wrapper or documented command path that performs build/preflight and can verify an already-deployed hosted telemetry surface.
3. Keep publishing/deploying behind an explicit command or flag; default verification must not mutate Cloudflare resources.
4. Add tests or scripted dry-run checks for missing wrangler auth, missing bindings, build success, and verification output shape.
5. Run focused package checks without publishing and record the exact command an operator would use later to deploy.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Added `packages/site-registry-cloudflare/src/deploy-readiness.ts` with pure preflight and hosted health verification helpers.
- Added `packages/site-registry-cloudflare/scripts/hosted-telemetry-surface.mjs` with `preflight`, `verify`, and `deploy` commands.
- Added package scripts `deploy:preflight`, `deploy:verify`, and `deploy:live`.
- Live deployment is gated by both explicit `deploy --live` and `NARADA_SITE_TELEMETRY_DEPLOY_APPROVED=1`; default preflight performs build plus local config/auth/binding checks and does not deploy.
- Added tests for missing wrangler auth, placeholder/missing storage bindings, build/deploy command readiness shape, and hosted health verification output shape.
- Updated `docs/deployment/cloudflare-hosted-site-registry.md` with the non-mutating preflight/verify commands and the explicit gated deploy command.

Operator live deploy command, when separately authorized:

```powershell
$env:NARADA_SITE_TELEMETRY_DEPLOY_APPROVED="1"
pnpm --filter @narada2/site-registry-cloudflare deploy:live -- --config packages/site-registry-cloudflare/wrangler.jsonc
```

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 37 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:preflight` passed and returned blocked/non-mutating preflight because the committed example has no wrangler auth reference and placeholder KV/D1 ids.

## Acceptance Criteria

- [x] Deploy wrapper and verifier exist.
- [x] Live execution remains gated.
- [x] Tests do not require Cloudflare mutation.
