# Site Operational Dashboard

`@narada2/site-operational-dashboard` renders bounded operational dashboard
snapshots to static HTML.

The dashboard is an observation surface. It displays bounded posture rows and
evidence coordinates; it does not admit evidence, close tasks, triage inbox
items, grant capabilities, rotate secrets, or mutate Site state.

The renderer core is domain-agnostic. It accepts structured snapshot objects
from callers and does not read local Site files, add domain-specific rows, or
expose mutation controls.

## API

- `validateDashboardSnapshot(snapshot)`
- `summarizeDashboardSections(snapshot)`
- `renderDashboardHtml(snapshot, options?)`
- `createDashboardServer(options)`
- `buildSiteRegistryProjectionSection(input)`
- `buildSiteRegistryProjectionRows(input)`
- `@narada2/site-operational-dashboard/narada-proper`
  - `collectNaradaProperDashboardSections(context)`
  - `buildNaradaProperDashboardSnapshot(context)`
  - `flattenDashboardRows(sections)`
- `escapeHtml(value)`
- `safeJsonForHtml(value)`

Rendered HTML embeds a bounded JSON payload in
`<script id="dashboard-data" type="application/json">`.

## Usage

Static render:

```ts
import { renderDashboardHtml } from '@narada2/site-operational-dashboard';

const html = renderDashboardHtml(snapshot);
```

Narada proper provider composition:

```ts
import { buildNaradaProperDashboardSnapshot } from '@narada2/site-operational-dashboard/narada-proper';

const snapshot = await buildNaradaProperDashboardSnapshot({
  site_ref: 'narada-proper',
  generated_at: new Date().toISOString(),
  artifacts: [
    { key: 'task_lifecycle', evidence_ref: 'narada task lifecycle status --format json', data: taskLifecycleSummary },
  ],
});
```

Provider inputs are caller-owned bounded artifacts or lazy read functions. The
provider module does not run task, inbox, roster, publication, or secret
mutation commands.

CLI generation belongs in the Narada CLI layer. A CLI should collect bounded
artifacts through sanctioned read-only commands, build a snapshot, call
`renderDashboardHtml`, and write the static report. It must not make the report
writer a task/inbox/publication/capability mutation surface.

## Local Server

`createDashboardServer` creates a read-only Node HTTP server from a caller-owned
snapshot loader. The caller chooses the port with `server.listen(...)` and may
pass `siteRoot` and `refreshMs`; those values are forwarded to the loader and
included in the JSON response. The server exposes only `GET`/`HEAD` HTML and
snapshot routes with `cache-control: no-store`.

Bind local live servers to `127.0.0.1` by default. Sensitive snapshot reads are
bearer-token guarded when the caller supplies
`accessToken`, the initial browser shell remains loadable without live Site
data, while `/snapshot.json` and `/api/snapshot` require
`Authorization: Bearer <operator-entered-token>`. The expected token is an
explicit caller option; callers may source it from an environment variable,
credential reference resolver, or another governed local access surface, but
the package does not hardcode, print, serialize, or persist it. The token is a
local read guard only, not Site authority or capability-consent evidence.

The accepted browser flow for sensitive local routes is Staccato-style token
entry: the browser asks the operator for a bearer token, stores it in
`localStorage` for ergonomic reuse, sends it as an `Authorization: Bearer ...`
header on guarded requests, and provides a clear-token control that removes the
cached value. `localStorage` is only an ergonomic browser cache. It is not a
secure secret store, not a durable Narada capability registry, and not evidence
that a capability exists. The served HTML includes token-entry and clear-token
logic, but never embeds the configured token or live dashboard snapshot when
guarded mode is enabled.

## Optional Projection Providers

`buildSiteRegistryProjectionSection` and `buildSiteRegistryProjectionRows`
convert caller-supplied Site Registry or telemetry read-model JSON into bounded
observation rows. They do not fetch the network by default and they do not grant
Site authority or capabilities. Live-fetch posture is represented only when the
caller explicitly supplies `liveFetch.enabled`.

`@narada2/site-operational-dashboard/narada-proper` provides local Narada proper
row providers for caller-supplied Site identity, task lifecycle, roster, inbox,
inbox-drop, publication, telemetry, package/build, capability, residual, and
work-next artifacts. Missing artifacts become `unknown` rows with missing
freshness rather than inferred readiness.

## Provider Authoring Rules

Provider rows must include:

- `state`: one of `ok`, `info`, `attention`, `warning`, `blocked`, `error`, or
  `unknown`;
- `basis`: a concise explanation of the observation;
- `observed_at` or a `freshness` object;
- `evidence_refs` or `evidence_paths`;
- `next_action` when a bounded governed follow-up is useful;
- `authority_limits` stating the row is observational and non-mutating.

Freshness belongs to the source observation, not the dashboard render time.
Missing, stale, or inferred inputs must stay visible as `unknown`, `stale`,
`attention`, or `blocked` rows.

Provider details must be bounded summaries. Do not include raw inbox bodies, raw
DB rows, raw logs, raw transcripts, bearer tokens, passwords, private keys, API
keys, credential resolver output, or raw external payloads. Capability refs and
secret refs are allowed only as references, not values.

## Staccato Lift Boundary

Reusable mechanics lifted from Staccato:

- bounded row/section/snapshot rendering;
- section and state filtering;
- attention row selection;
- static HTML with embedded JSON;
- optional read-only local server shape;
- browser token-entry ergonomics for caller-owned sensitive routes;
- redaction and no-raw-secret tests.

Not lifted into generic defaults:

- Staccato paths, roots, account ids, report names, campaign concepts, C4X,
  Klaviyo, BigCommerce, GA4, Yotpo, or mailbox-specific rows;
- Staccato hosted worker coordinates, event names, secret names, dashboard
  branding, or client-service assumptions;
- any UI control that mutates task lifecycle, inbox, publication, credentials,
  external services, or Site authority.
