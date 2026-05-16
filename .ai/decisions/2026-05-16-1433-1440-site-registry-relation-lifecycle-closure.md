# Site Registry Relation Lifecycle Chapter Closure

Chapter: `1433-1440 Site Registry Relation Lifecycle`
Closed by: `narada.architect`
Date: `2026-05-16`

## Final Posture

The chapter is locally implemented and locally proven for the hosted Site
Registry package. It is not yet claimed as live-deployed in Cloudflare for this
chapter.

Supported implementation posture:

- versioned relation lifecycle contract exists;
- D1 migration exists for relation current state and transition event evidence;
- Worker transition API exists at `POST /api/relations/transition`;
- Site-originated withdrawal and registry-owner/admin transitions use separate
  bearer capability token bindings;
- transition responses are bounded cloud receipts only;
- public `/api/sites`, `/api/freshness`, and tiles include only
  `state=active` and `visibility=public` relations;
- protected projection evidence remains retained after withdrawal;
- hosted UI displays relation lifecycle posture without mutation controls;
- local non-live smoke fixture proves activation, withdrawal filtering,
  suppression, invalid purge refusal, unauthorized refusal, and retained
  projection evidence.

## Supported Transitions

First-slice supported relation transitions:

- `activate`
- `withdraw`
- `retire`
- `suppress`
- `unsuppress`
- `reject`
- `reactivate`

`purge` and `delete` are explicitly refused by the transition API. Purge is
recorded as a future high-authority operation in
`docs/product/site-registry-purge-posture.v0.md`.

## Authority Limits

This chapter did not:

- mutate represented Site authority;
- mutate Narada local inbox or task lifecycle through the Worker;
- delete D1 rows, KV projections, telemetry events, message receipts, or audit
  evidence;
- implement purge;
- claim privacy compliance;
- claim multi-Site federation readiness;
- record raw bearer tokens or raw secret values.

## Verification

Final verification:

- `pnpm --filter @narada2/site-registry-cloudflare smoke:fixture` passed: 1 file,
  3 tests.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 4 files,
  47 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- Chapter tasks 1433-1439 are closed with all acceptance criteria checked.

## Residuals

- Configure live relation capability secrets before live transition requests can
  be accepted.
- Build private/admin relation history surfaces in a separate chapter.
- Specify future purge/privacy/retention operation as a separate high-authority
  chapter before any destructive deletion work.
- Federation across multiple registries remains future work.

## Post-Closure Publication Update

After task/chapter closure, the Cloudflare publication step was executed:

- Remote D1 migration `0002_site_registry_relation_lifecycle.sql` applied to
  `narada-site-registry` (`ef40bbb6-9f1e-4005-a2e4-b14636cd81b8`).
- Worker deployed as version `e6ff9e55-44d3-4767-8ad0-57bb13a3a347`.
- Remote migration list reports no pending migrations.
- Live `/health` reports relation transition route present and projection-only
  authority limits intact.
- Live `/api/sites` reports one active public implicit relation for
  `narada-proper`, fresh, with retained projection provenance.
- Live relation transition secrets are not configured:
  `relation_withdraw_token_configured=false` and
  `relation_admin_token_configured=false`.

Live relation transition acceptance remains intentionally unclaimed until those
secrets are configured and a gated verification is run.
