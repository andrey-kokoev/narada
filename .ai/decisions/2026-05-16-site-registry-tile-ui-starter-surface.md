# Site Registry Tile UI Starter Surface

Generated: 2026-05-16

Task: `1432`

## Verdict

The hosted Site Registry root page now renders a read-only Site tile projection
surface instead of a route-list-first page.

The page remains projection-only. It reads `/api/sites`, displays Site tiles,
and reserves stable tile rows for future projected Site information.

## Tile Slots

Current tile slots:

- Site identity;
- freshness;
- health;
- observed timestamp;
- latest event;
- provenance count;
- active agents;
- open tasks;
- operator attention;
- critical action;
- inbox posture;
- publication edge.

Values not yet projected are shown as:

```text
not projected
```

No active agent counts, open task counts, operator attention state, or critical
action state are inferred from local Narada proper authority. Those fields await
future bounded telemetry events.

## Deployment

Worker:

```text
narada-site-registry
```

URL:

```text
https://narada-site-registry.andrei-kokoev.workers.dev
```

Observed version:

```text
6850fa07-2099-4aa2-a507-6a061f10fe93
```

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed, 37 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:live` passed.
- Live root HTML contains `site-grid`, `site-tile`, `Active agents`,
  `Open tasks`, `Operator attention`, `Critical action`, and `not projected`.
- Live root HTML does not contain `payload_summary`, `publish-token`, or
  `read-token`.
- Live `/api/sites` remains coherent: `site_count=1`, `fresh_count=1`,
  `missing_count=0`.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url
  https://narada-site-registry.andrei-kokoev.workers.dev` passed.

## Residual

Future buildout should add typed telemetry projection fields for active agents,
task posture, attention, critical action, inbox posture, and publication edges
before those fields display concrete values.
