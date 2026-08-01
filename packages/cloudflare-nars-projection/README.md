# Cloudflare NARS projection

This private workspace package contains the Cloudflare-origin NARS Worker and
Durable Object authority runtime. Its package exports point at compiled `dist/`
output; the repository ignores `dist/`, so consumer lifecycle gates build the
projection package before consuming it:

- @narada-core/agent-web-ui builds it before build, test, test:unit, and typecheck.
- @narada-core/cli builds it before build, test, and typecheck.

The same rule applies to a clean checkout: run the following before invoking a
consumer entry point directly:

    pnpm --filter @narada-core/cloudflare-nars-projection build

Wrangler binding types are generated and intentionally ignored because they
are derived from `wrangler.toml`. Regenerate them after changing Worker
bindings or when setting up a clean checkout:

    pnpm --filter @narada-core/cloudflare-nars-projection generate:types

Do not commit `worker-configuration.d.ts`; the checked-in Wrangler
configuration and this command are the source of truth.

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

    pnpm --filter @narada-core/cloudflare-nars-projection smoke:provider-capable-live

The synthetic authority smoke and the provider-capable smoke target different
deployments. Deploy the synthetic worker with the configuration that omits D1
and AI bindings:

    pnpm --filter @narada-core/cloudflare-nars-projection deploy:synthetic

Run the synthetic smoke against that worker, including the browser credential
required by the deployment:

    pnpm --filter @narada-core/cloudflare-nars-projection smoke:cloudflare-origin-live -- --live --cloudflare-api-base-url https://<synthetic-nars-worker> --browser-token fingerprint:<operator-browser>

The deployed provider-capable smoke requires an HTTPS Worker URL, an explicit
principal, and the browser credential. It creates and revokes one session, so
it must be run only against an operator-approved production deployment:

    pnpm --filter @narada-core/cloudflare-nars-projection smoke:provider-capable-live -- --live --cloudflare-api-base-url https://<nars-worker> --principal-id principal:<operator> --browser-token fingerprint:<operator-browser>

The operator-console mirror live E2E uses an explicit, ephemeral Narada-owned
shared-secret handoff. Pass the same secret configured as the Worker
`NARADA_OPERATOR_CONSOLE_SHARED_SECRET` Wrangler secret on stdin; do not put
it in an argument, environment variable, or evidence file. The Worker also
accepts this secret through its browser login page and stores only an HttpOnly
session cookie.
The full profile also requires `--turn-content <sentinel>`, a concrete
`--artifact-id`, and the expected `--artifact-sha256`. It proves input
admission, turn start, assistant output, terminal completion, rendered event
rows, real launch/onboarding UI actions, and the disposable registry form
journey in addition to route replay:

    Get-Secret -Name <narada-operator-console-secret> -AsPlainText | pnpm --filter @narada-core/cloudflare-nars-projection test:operator-console-mirror-live -- --url https://<worker-host> --operator-secret-stdin --turn-content LIVE_E2E_OK --artifact-id <artifact-id> --artifact-sha256 <artifact-content-sha256>

Use `plan:operator-console-mirror-live` for an explicit offline plan. Use
`--mutation-mode none --allow-skipped-journeys` only for a reachability
diagnostic; that result is reported as `passed_with_skips`. The explicit
`--mutation-mode api-disposable` profile covers backend mutation transport and
does not replace the browser UI journey.
The failure-injection commands are separate and explicit:
`test:operator-console-mirror-live:tunnel-loss`,
`test:operator-console-mirror-live:route-revocation`, and
`test:operator-console-mirror-live:stale-lease`.

Each run writes a unique JSON evidence file under
`.narada/evidence/operator-console-mirror-live/` and appends a redacted
summary to `index.jsonl`; a later run cannot overwrite an earlier run's
evidence. Wrangler remains the deployment/configuration authority, while the
stdin handoff is only for the live acceptance process.
