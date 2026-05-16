# Cloudflare Hosted Site Registry Readiness

Date: 2026-05-16

Verdict: smoke-ready, not live-deployed.

The Cloudflare hosted Site Registry projection chapter produced:

- `packages/site-registry-cloudflare` Worker package.
- Projection-only event receiver, read APIs, human peek surface, and remote
  message exchange.
- Client helpers for bounded Site event publishing and hosted message pulling.
- D1 migrations and schema notes.
- Gated deployment runbook.
- Non-live smoke fixture.

Verification:

- `pnpm --filter @narada2/site-config test`
- `pnpm --filter @narada2/site-inbox test`
- `pnpm --filter @narada2/site-registry-cloudflare smoke:fixture`
- `pnpm --filter @narada2/site-registry-cloudflare test`
- `pnpm --filter @narada2/site-config typecheck`
- `pnpm --filter @narada2/site-inbox typecheck`
- `pnpm --filter @narada2/site-registry-cloudflare typecheck`
- `pnpm --filter @narada2/site-config build`
- `pnpm --filter @narada2/site-inbox build`
- `pnpm --filter @narada2/site-registry-cloudflare build`

Authority posture:

- Hosted registry is projection-only.
- It does not mutate Site config.
- It does not admit canonical inbox or task lifecycle state.
- It does not certify identity or grant capabilities.
- Remote messages remain candidate state until a local Site reports admission,
  rejection, or error evidence.
- No live Cloudflare deploy was performed.

Live residuals:

- Operator capability grant for live Cloudflare deployment.
- Cloudflare account/zone routing decision.
- D1 database creation and remote migration evidence.
- KV namespace creation evidence.
- Secret binding and rotation plan.
- DNS or workers.dev route setup.
- Post-deploy smoke evidence.
- Monitoring and operational ownership decision.
