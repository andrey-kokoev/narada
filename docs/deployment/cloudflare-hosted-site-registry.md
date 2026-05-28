# Cloudflare Hosted Site Telemetry Surface

This runbook materializes `@narada2/site-registry-cloudflare` as a hosted
Site Telemetry Surface realization. The SiteRegistry remains one read model
served by the surface. This is not the Cloudflare Site Cycle runtime and is not
Site authority.

Compatibility posture: existing package name, route names, Wrangler example,
and `NARADA_SITE_REGISTRY_*` bindings are preserved for the current deployment
slice. Treat those names as deployment/read-model coordinates, not as proof that
the surface owns every Site it displays.

## Preconditions

- Operator grants live Cloudflare deployment capability for this Site Telemetry
  Surface realization.
- Cloudflare account id and target zone or workers.dev routing decision are
  available outside the repo.
- Secret values exist in the operator-approved secret store. Do not write raw
  secret values into repo files, task reports, or smoke output.
- `packages/site-registry-cloudflare/wrangler.example.jsonc` has been copied to
  a local deploy config and filled with real D1/KV ids outside committed
  evidence.

## Setup

1. Create KV namespace:
   `wrangler kv namespace create NARADA_SITE_REGISTRY_KV`
2. Create D1 database:
   `wrangler d1 create narada-site-registry`
3. Apply migrations:
   `wrangler d1 migrations apply narada-site-registry --local`
   `wrangler d1 migrations apply narada-site-registry --remote`
4. Configure Worker secrets:
   `NARADA_SITE_REGISTRY_READ_TOKEN`
   `NARADA_SITE_REGISTRY_PUBLISH_TOKEN`
   `NARADA_SITE_REGISTRY_MESSAGE_TOKEN`
   `NARADA_SITE_REGISTRY_POLL_TOKEN`
   `NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN`
   `NARADA_SITE_REGISTRY_ADMIN_TOKEN`
5. Configure vars:
   `NARADA_SITE_REGISTRY_MODE=projection_only`
   `NARADA_SITE_REGISTRY_KNOWN_SITE_IDS=<comma separated known Sites>`
   `NARADA_SITE_REGISTRY_MAX_PAYLOAD_BYTES=65536`
   `NARADA_SITE_REGISTRY_EVENT_CAPABILITY_REF=capability:site_registry.event_publish`

The variable names are compatibility names. They should be read as hosted
telemetry surface configuration for the SiteRegistry read-model route family.

## Non-Live Smoke

Run before any live deploy:

```powershell
pnpm --filter @narada2/site-registry-cloudflare smoke:fixture
pnpm --filter @narada2/site-registry-cloudflare test
pnpm --filter @narada2/site-registry-cloudflare typecheck
pnpm --filter @narada2/site-registry-cloudflare build
pnpm --filter @narada2/site-registry-cloudflare deploy:preflight
```

The smoke fixture verifies health, auth refusal, accepted event projection,
protected projection read, remote message submit, pending poll, finalize, and
receipt read without live network or Cloudflare credentials.

## Relation Verifier Enrollment

Relation withdrawal verifier enrollment is not a public route in this slice.
Use the package preflight helper to produce a dry-run plan first. A live D1
verifier seed or rotation requires registry-owner/operator standing, bounded
evidence refs, an accepted relation capability ref, a credential ref, and
explicit execute/admin approval. The preflight plan never creates or rotates
remote Worker secret material.

Creating or rotating the Cloudflare secret value referenced by `credential_ref`
is a separate capability-governed secret operation. Record only the credential
ref, verifier id, bounded evidence refs, and smoke result; do not record raw
secret values in runbook output, task reports, fixtures, or response bodies.

## Live Deploy

Live deploy remains gated. Record the operator capability grant, Cloudflare
account/zone decision, D1 id, KV id, secret binding evidence, migration output
reference, deployed Worker URL, and post-deploy smoke result before claiming live
readiness. These values are deployment coordinates, not Site authority.

Deploy only after the gate is satisfied:

```powershell
pnpm --filter @narada2/site-registry-cloudflare build
$env:NARADA_SITE_TELEMETRY_DEPLOY_APPROVED="1"
pnpm --filter @narada2/site-registry-cloudflare deploy:live -- --config packages/site-registry-cloudflare/wrangler.jsonc
```

## Post-Deploy Smoke

Against the provided Worker URL, verify:

- `GET /health` returns projection-only posture.
- unauthenticated protected routes refuse without echoing token values.
- authenticated `POST /webhook` accepts a bounded known-Site event.
- authenticated `GET /api/projections/:site_id` reads the projection.
- authenticated message submit, pending poll, finalize, and receipt routes work.

Record only bounded response metadata and evidence references. Do not record raw
token values.

The non-mutating health verifier is:

```powershell
pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url https://<worker-url>
```

## Rollback

1. Stop producers from publishing to the hosted registry endpoint.
2. Re-deploy the previous Worker version or disable the route.
3. Preserve D1/KV data for forensic review unless the operator explicitly grants
   destructive cleanup.
4. Record rollback evidence and the reason readiness was withdrawn.

## Readiness Posture

This runbook does not assert production readiness. Production readiness requires
live operator capability grant, successful deploy evidence, successful remote
smoke evidence, and a closed readiness proof task.
