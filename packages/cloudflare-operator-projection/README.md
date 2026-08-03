# Cloudflare Operator Projection

This private workspace package owns the shared Cloudflare-origin projection
Worker and its Durable Object NARS authority runtime. The Worker exposes NARS
session routes together with the remote Operator Console and Host Fleet
projection routes. The package name describes the shared projection boundary;
it does not transfer NARS or Host Fleet authority to the Operator Console or
to Cloudflare. Its package exports point at compiled `dist/` output; the
repository ignores `dist/`, so consumer lifecycle gates build the projection
package before consuming it:

- @narada-core/agent-web-ui builds it before build, test, test:unit, and typecheck.
- @narada-core/cli builds it before build, test, and typecheck.

The same rule applies to a clean checkout: run the following before invoking a
consumer entry point directly:

    pnpm --filter @narada-core/cloudflare-operator-projection build

## Cloudflare-native runtime

The provider-capable lane uses the shared
`@narada-core/invokable-intelligence-runtime` Cloudflare gateway. D1 owns the
catalog and plan; the Worker supplies `INTELLIGENCE_REGISTRY_DB`, optional `AI`,
outbound fetch, and named secret bindings referenced by catalog credential
locators. The Durable Object owns the NARS session, ordered event journal,
replay, health, input serialization, abort, and revocation. Local filesystem,
shell, local MCP, and local artifact authority are not available in this lane.

Production sessions require `principal_id` and verify `site_id`,
`user_site_id`, and `host_site_id` against D1 before provider dispatch.

## Verification

Planning mode is safe and does not contact a deployment:

    pnpm --filter @narada-core/cloudflare-operator-projection smoke:provider-capable-live

The synthetic authority smoke and the provider-capable smoke target different
deployments. Deploy the synthetic worker with the configuration that omits D1
and AI bindings:

    pnpm --filter @narada-core/cloudflare-operator-projection deploy:synthetic

Run the synthetic smoke against that worker, including the browser credential
required by the deployment:

    pnpm --filter @narada-core/cloudflare-operator-projection smoke:cloudflare-origin-live -- --live --cloudflare-api-base-url https://<synthetic-operator-projection-worker> --browser-token fingerprint:<operator-browser>

The deployed provider-capable smoke requires an HTTPS Worker URL, an explicit
principal, and the browser credential. It creates and revokes one session, so
it must be run only against an operator-approved production deployment:

    pnpm --filter @narada-core/cloudflare-operator-projection smoke:provider-capable-live -- --live --cloudflare-api-base-url https://<operator-projection-worker> --principal-id principal:<operator> --browser-token fingerprint:<operator-browser>
