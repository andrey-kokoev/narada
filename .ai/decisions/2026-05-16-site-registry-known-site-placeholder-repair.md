# Site Registry Known Site Placeholder Repair

Generated: 2026-05-16

Task: `1431`

## Verdict

The hosted Site Registry `missing_count: 1` was caused by a placeholder known
Site id, not by a real admitted missing Site.

The placeholder was:

```text
user-site
```

It was configured in:

```text
packages/site-registry-cloudflare/wrangler.jsonc
NARADA_SITE_REGISTRY_KNOWN_SITE_IDS=narada-proper,user-site
```

## Repair

Changed the live Worker known-site list to:

```text
NARADA_SITE_REGISTRY_KNOWN_SITE_IDS=narada-proper
```

Also changed the example Wrangler config to avoid carrying the placeholder
forward.

This repair removes an unadmitted expectation. It does not forge telemetry for
`user-site`, does not create a User Site relation, and does not admit
`narada-andrey` or any other Site into the registry.

## Deployment

Redeployed `narada-site-registry` after the config correction.

Observed deploy version:

```text
40844adf-592c-41d5-bd50-6720126c77b4
```

Surface:

```text
https://narada-site-registry.andrei-kokoev.workers.dev
```

## Verification

Before repair:

```json
{
  "site_count": 2,
  "fresh_count": 1,
  "missing_count": 1,
  "missing_site_id": "user-site"
}
```

After repair, `GET /api/sites` returned:

```json
{
  "site_count": 1,
  "fresh_count": 1,
  "stale_count": 0,
  "missing_count": 0,
  "failing_count": 0
}
```

After repair, `GET /api/freshness` returned only `narada-proper` with
`freshness: fresh`.

Additional checks:

- `pnpm --filter @narada2/site-registry-cloudflare deploy:preflight` passed.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed, 37 tests.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url https://narada-site-registry.andrei-kokoev.workers.dev` passed.

## Residual

A future real User Site, including `narada-andrey`, needs a separate admitted
Site relation/publication edge before it is counted as expected by this hosted
registry.
