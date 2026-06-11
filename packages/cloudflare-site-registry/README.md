# Cloudflare Site Registry

`@narada2/cloudflare-site-registry` owns the Cloudflare D1-backed site coordinate for Narada.

It is intentionally separate from `@narada2/cloudflare-carrier`:

- the carrier preserves Narada runtime/session semantics on Cloudflare;
- the site registry owns site identity, membership authority, settings, and carrier-session binding evidence.

## Package Boundary

This package owns:

- `cloudflare_sites`
- `cloudflare_site_memberships`
- `cloudflare_site_settings`
- `cloudflare_site_carrier_sessions`
- `cloudflare_site_authority_events`

It exposes a registry API for:

- `site.create`
- `site.read`
- `site.list`
- `site.settings.put`
- `site.carrier_session.bind`

The carrier Worker may use `createCloudflareSiteRegistryAdapter(env)` to validate a `session.start` site binding when a D1 binding is present. If no registry D1 binding is configured, the carrier remains a carrier-only runtime slice.

## Cloudflare Binding

Use one of these D1 bindings:

- `CLOUDFLARE_SITE_REGISTRY_DB`
- `NARADA_SITE_REGISTRY_DB`

## Checks

```powershell
pnpm --filter @narada2/cloudflare-site-registry test
pnpm --filter @narada2/cloudflare-site-registry ship
```

## D1 Migrations

The site registry owns the D1 schema for `narada-cloudflare-site-registry`.
Apply these migrations from this package boundary, not from the carrier task database:

```powershell
pnpm --filter @narada2/cloudflare-site-registry d1:migrations:local
pnpm --filter @narada2/cloudflare-site-registry d1:migrations:remote
```
