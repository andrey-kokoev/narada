# @narada2/site-registry-cloudflare

Cloudflare Worker realization of a Narada Site Telemetry Surface. The
SiteRegistry is one read model served by this surface, not the whole authority
object and not the owning Site.

This package is not `@narada2/cloudflare-site`. It does not run Cycles, mutate
Site state, admit inbox envelopes, change task lifecycle rows, certify identity,
or grant capabilities. It hosts bounded projection inputs and read models.

Compatibility posture: the package name, route names, environment bindings, and
existing import paths remain `site-registry-cloudflare` / `NARADA_SITE_REGISTRY_*`
for current callers and deployment templates. New docs should describe this as
a Site Telemetry Surface realization with SiteRegistry as a read model.

## Staccato-Inspired Shape

The package follows the reusable shape proven by the Staccato hosted surface:

- guarded `POST /webhook` for typed projection events;
- read-only projection APIs;
- optional human peek page;
- KV for latest projection records;
- D1 for event/message/audit rows;
- bearer capability secrets split by action family;
- local publisher/puller tooling in later tasks.

Staccato-specific event names, dashboard rows, report names, account ids, D1 ids,
KV ids, and secret names are not imported.

## Initial Routes

| Method | Route | Status |
| --- | --- | --- |
| `GET` | `/` | human shell placeholder |
| `GET` | `/health` | projection-only health |
| `POST` | `/webhook` | guarded typed Site event receiver |
| `GET` | `/api/sites` | bounded registry summary |
| `GET` | `/api/freshness` | bounded freshness summary |
| `GET` | `/api/projections/:site_id` | read-token protected Site projection |
| `POST` | `/api/messages` | submit-token protected remote message candidate |
| `GET` | `/api/messages/pending` | poll-token protected pending message list |
| `GET` | `/api/messages/:message_id` | poll-token protected message detail |
| `GET` | `/api/messages/:message_id/receipt` | poll-token protected receipt detail |
| `POST` | `/api/messages/:message_id/finalize` | finalize-token protected receipt update |
| `POST` | `/api/relations/transition` | relation-token protected lifecycle transition |

## Cloudflare Bindings

See `wrangler.example.jsonc` for the deployment template. The example contains
placeholder ids only and is not a live deployment config. Worker name, route,
D1 database id, KV namespace id, and domain are deployment coordinates, not Site
authority.

## Event Receiver

`POST /webhook` accepts current `narada.site_event.envelope.v0` compatibility
payloads and future `narada.site_telemetry.event.v0` payloads through the
`@narada2/site-config` telemetry event contract validator. The Worker
authenticates bearer capability tokens locally, refuses unknown Sites and
unsupported families, checks payload bounds, rejects raw-secret markers, stores
idempotency records and latest projection read models in KV, and records bounded
audit metadata in D1 when the binding is present.

## Read Surface

The public summary and freshness routes expose bounded projection posture only.
Per-Site projection detail requires `NARADA_SITE_REGISTRY_READ_TOKEN`. Responses
include no-authority fields and never echo bearer token values.

## Remote Message Exchange

Hosted messages use `@narada2/site-inbox` remote exchange contracts. Submitted
messages remain remote pending candidates in D1 until a local Site reports
admitted, rejected, or error finalization evidence. Cloud receipts are not local
canonical inbox admission, and finalized admitted receipts reference local
admission evidence instead of performing admission in the Worker.

## Relation Lifecycle

`POST /api/relations/transition` records bounded registry relation lifecycle
transitions in D1. Site-originated withdrawal uses
`NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN`; registry-owner lifecycle actions
such as suppress, retire, activate, reject, or reactivate use
`NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN`. Responses are cloud receipts over
registry projection state only; they do not mutate represented Site authority or
delete provenance. Purge/delete transitions are refused in this slice.

The non-live smoke fixture at `fixtures/relation-lifecycle-smoke.v0.json`
contains only capability references and expected summaries, not bearer tokens.
`pnpm --filter @narada2/site-registry-cloudflare smoke:fixture` proves the local
active-to-withdrawn flow with fake KV/D1, plus suppression, invalid transition,
and unauthorized refusal posture. Live smoke must remain route-shape/refusal-only
unless `NARADA_SITE_REGISTRY_LIVE_RELATION_MUTATION=1` is explicitly set by the
operator for a controlled relation mutation.

## Client Helpers

`@narada2/site-registry-cloudflare/client` exports helpers for local Sites to
publish bounded Site events and pull hosted messages. The compatibility publish
helper still accepts ad hoc endpoint config. The Publication Edge helper path
accepts a `SiteTelemetryPublicationEdge`, preflights it before transport, and
resolves capability references only when a live send is requested. Dry-run mode
does not resolve raw secret values or perform network I/O.
