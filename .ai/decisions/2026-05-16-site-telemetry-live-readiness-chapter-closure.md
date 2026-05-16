# Site Telemetry Publication Live Readiness Chapter Closure

Generated: 2026-05-16

Range: `1420-1430`

## Verdict

The chapter is closed with a bounded live first slice.

Supported posture:

```text
hosted_deployed;
receiving_verified;
Site config connected for Narada proper;
manual smoke publish verified;
not custom-domain-routed;
not operationally_monitored;
not live_deployed as an operational steady-state claim.
```

The earlier blocker artifact
`.ai/decisions/2026-05-16-site-telemetry-live-readiness-chapter-closure-blocker.md`
is historical. It was accurate before the subsequent operator-authorized
deployment and config mutation, but it no longer describes the final chapter
posture.

## Deployment Coordinates

- Cloudflare account id: `aa93aee1fd6a15f4efc9832219ceea2c`
- Worker: `narada-site-registry`
- Workers.dev URL: `https://narada-site-registry.andrei-kokoev.workers.dev`
- Current observed deployment version after secret changes:
  `9492e9d6-b6f7-4478-a594-e3a207e18aef`
- D1 database: `narada-site-registry`
- D1 database id: `ef40bbb6-9f1e-4005-a2e4-b14636cd81b8`
- KV binding: `NARADA_SITE_REGISTRY_KV`
- KV namespace id: `ef880946a3b24d28b95a280a6b72ecc2`

No custom `narada.systems` route was configured in this chapter.

## Evidence

- `.ai/decisions/2026-05-16-site-telemetry-live-deployment-evidence.md`
- `.narada/site.json`
- `packages/site-registry-cloudflare/wrangler.jsonc`
- `pnpm --filter @narada2/site-registry-cloudflare deploy:preflight`
- `wrangler d1 migrations apply narada-site-registry --remote --config packages/site-registry-cloudflare/wrangler.jsonc`
- `pnpm --filter @narada2/site-registry-cloudflare deploy:live`
- `wrangler deployments list --config packages/site-registry-cloudflare/wrangler.jsonc`
- `pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url https://narada-site-registry.andrei-kokoev.workers.dev`
- `pnpm --filter @narada2/site-registry-cloudflare test`
- `pnpm --filter @narada2/site-config test`

Live smoke verified:

- health endpoint reachable;
- protected publish route rejects missing/invalid bearer auth with `401`;
- bounded telemetry event accepted;
- projection recorded and readable;
- Narada proper Site projection readable;
- remote candidate submit, pending, finalize, and receipt paths work;
- token echo check passed.

## Secret Posture

Worker bearer secrets were generated in process memory and installed through
`wrangler secret put`.

Configured Worker secret names:

- `NARADA_SITE_REGISTRY_READ_TOKEN`
- `NARADA_SITE_REGISTRY_PUBLISH_TOKEN`
- `NARADA_SITE_REGISTRY_MESSAGE_TOKEN`
- `NARADA_SITE_REGISTRY_POLL_TOKEN`
- `NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN`
- `NARADA_SITE_REGISTRY_ADMIN_TOKEN`

Raw secret values are not recorded in repo config, task evidence, or decision
artifacts.

## Config Connection

Narada proper Site config at `.narada/site.json` now contains:

- `site_telemetry.telemetry_destinations[0]` for
  `narada-proper-site-telemetry-publication-v0`;
- Worker webhook and health URLs;
- capability references instead of raw tokens;
- `publication_edge` describing publisher/owner `narada-proper`, secret
  resolver posture, evidence refs, and readiness trust posture.

Deployment, smoke verification, and config connection remain distinct governed
crossings.

## Residuals

- Configure an admitted custom route only after the `narada.systems` zone id and
  route authority are available.
- Add operational monitoring before claiming steady-state `live_deployed`.
- Add scheduled/local publisher evidence before claiming ongoing
  `publishing_verified` beyond manual smoke publication.
- Define rotation procedure for the Cloudflare Worker bearer secrets before the
  next review date in `.narada/site.json`.

## Anti-Overclaim

Do not describe this as a fully operational Site telemetry mesh. The correct
short form is:

```text
Narada proper has a Cloudflare-hosted Site Telemetry publication surface on
Workers.dev, verified by smoke, and connected in local Site config; custom route,
monitoring, and steady-state scheduled publication remain residual.
```
