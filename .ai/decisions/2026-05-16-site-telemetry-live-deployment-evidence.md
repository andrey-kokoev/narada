# Site Telemetry Live Deployment Evidence

Generated: 2026-05-16

## Verdict

The Narada proper Site Telemetry Publication surface is hosted deployed and
receiving verified on the Workers.dev route.

Current supported posture:

```text
hosted_deployed;
receiving_verified;
not yet custom-domain-routed;
not yet publishing_verified by scheduled local publisher;
not yet operationally_monitored beyond smoke evidence.
```

## Cloudflare Coordinates

| Coordinate | Value |
| --- | --- |
| Account id | `aa93aee1fd6a15f4efc9832219ceea2c` |
| Worker name | `narada-site-registry` |
| Surface URL | `https://narada-site-registry.andrei-kokoev.workers.dev` |
| Initial upload version id | `c74f8bef-de19-40fe-877c-80837d83388d` |
| Current observed version id | `9492e9d6-b6f7-4478-a594-e3a207e18aef` |
| D1 database name | `narada-site-registry` |
| D1 database id | `ef40bbb6-9f1e-4005-a2e4-b14636cd81b8` |
| KV namespace title | `NARADA_SITE_REGISTRY_KV` |
| KV namespace id | `ef880946a3b24d28b95a280a6b72ecc2` |

These are deployment coordinates, not Site authority.

## Deployment Evidence

Deploy command:

```powershell
$env:NARADA_SITE_TELEMETRY_DEPLOY_APPROVED='1'
pnpm --filter @narada2/site-registry-cloudflare deploy:live
```

Observed:

- Worker uploaded: `narada-site-registry`;
- deployed URL: `https://narada-site-registry.andrei-kokoev.workers.dev`;
- initial upload version id: `c74f8bef-de19-40fe-877c-80837d83388d`;
- current observed version after Worker secret changes:
  `9492e9d6-b6f7-4478-a594-e3a207e18aef`;
- bindings: `NARADA_SITE_REGISTRY_KV`, `NARADA_SITE_REGISTRY_D1`;
- mode: `projection_only`;
- raw secret values recorded: `false`.

## Storage Migration Evidence

Command:

```powershell
wrangler d1 migrations apply narada-site-registry --remote --config packages/site-registry-cloudflare/wrangler.jsonc
```

Observed:

- migration applied: `0001_site_event_projection.sql`;
- commands executed: `8`;
- status: success.

## Secret Posture

Worker secrets were generated and written to Cloudflare Worker Secrets without
printing or committing raw values:

- `NARADA_SITE_REGISTRY_READ_TOKEN`;
- `NARADA_SITE_REGISTRY_PUBLISH_TOKEN`;
- `NARADA_SITE_REGISTRY_MESSAGE_TOKEN`;
- `NARADA_SITE_REGISTRY_POLL_TOKEN`;
- `NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN`;
- `NARADA_SITE_REGISTRY_ADMIN_TOKEN`.

Raw secret values are not recorded in repo files, task reports, Site config, or
this evidence artifact.

## Smoke Evidence

Live smoke was run against:

```text
https://narada-site-registry.andrei-kokoev.workers.dev
```

Bounded result summary:

- health status: `scaffold`;
- read token configured: `true`;
- publish token configured: `true`;
- message token configured: `true`;
- poll token configured: `true`;
- local admission token configured: `true`;
- invalid publish request returned: `401`;
- valid telemetry event status: `accepted`;
- projection event recorded: `true`;
- SiteRegistry summary site count: `2`;
- Narada proper projection status: `ok`;
- remote candidate submit status: `submitted`;
- pending candidate count during smoke: `1`;
- finalize status: `admitted`;
- receipt status: `admitted`;
- token echo detected: `false`.

`pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url
https://narada-site-registry.andrei-kokoev.workers.dev` returned
`status=verified`, `health_status=200`, `mode=projection_only`, and
`raw_secret_values_recorded=false`.

## Authority Limits

- The hosted surface is projection/candidate infrastructure, not Narada proper
  Site authority.
- Cloud receipt is not local inbox admission.
- D1/KV projection state is not Site truth.
- Site config connection records URL and capability refs only.
- Custom domain routing remains a separate route/DNS mutation.
