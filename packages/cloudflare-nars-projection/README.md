# Cloudflare NARS projection

This private workspace package contains the Cloudflare-origin NARS Worker and
Durable Object authority runtime. Its package exports point at compiled `dist/`
output; the repository ignores `dist/`, so consumer lifecycle gates build the
projection package before consuming it:

- @narada2/agent-web-ui builds it before build, test, test:unit, and typecheck.
- @narada2/cli builds it before build, test, and typecheck.

The same rule applies to a clean checkout: run the following before invoking a
consumer entry point directly:

    pnpm --filter @narada2/cloudflare-nars-projection build

## Cloudflare-native runtime

The provider-capable lane uses the shared
`@narada2/invokable-intelligence-runtime` Cloudflare gateway. D1 owns the
catalog and plan; the Worker supplies `INTELLIGENCE_REGISTRY_DB`, optional `AI`,
outbound fetch, and named secret bindings referenced by catalog credential
locators. The Durable Object owns the NARS session, ordered event journal,
replay, health, input serialization, abort, and revocation. Local filesystem,
shell, local MCP, and local artifact authority are not available in this lane.

Production sessions require `principal_id` and verify `site_id`,
`user_site_id`, and `host_site_id` against D1 before provider dispatch.

## Verification

Planning mode is safe and does not contact a deployment:

    pnpm --filter @narada2/cloudflare-nars-projection smoke:provider-capable-live

The synthetic authority smoke and the provider-capable smoke target different
deployments. Deploy the synthetic worker with the configuration that omits D1
and AI bindings:

    pnpm --filter @narada2/cloudflare-nars-projection deploy:synthetic

Run the synthetic smoke against that worker, including the browser credential
required by the deployment:

    pnpm --filter @narada2/cloudflare-nars-projection smoke:cloudflare-origin-live -- --live --cloudflare-api-base-url https://<synthetic-nars-worker> --browser-token fingerprint:<operator-browser>

The deployed provider-capable smoke requires an HTTPS Worker URL, an explicit
principal, and the browser credential. It creates and revokes one session, so
it must be run only against an operator-approved production deployment:

    pnpm --filter @narada2/cloudflare-nars-projection smoke:provider-capable-live -- --live --cloudflare-api-base-url https://<nars-worker> --principal-id principal:<operator> --browser-token fingerprint:<operator-browser>
