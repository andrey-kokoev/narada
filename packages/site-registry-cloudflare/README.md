# @narada2/site-registry-cloudflare

Cloudflare Worker realization that currently co-locates four Narada hosted
surface concerns: Site Operational Telemetry, Site Registry, Registry
Operational Telemetry, and Site Communication Candidate Exchange. The
Site Registry grid is the primary public read model, not the whole authority
object and not the owning Site.

This package is not `@narada2/cloudflare-site` and it is not `@narada2/cloudflare-site-registry`.
`@narada2/cloudflare-site-registry` is the carrier-embedded D1 site registry runtime;
this package is the hosted Cloudflare Worker read-model surface. It does not run
Cycles, mutate Site state, admit inbox envelopes, change task lifecycle rows,
certify identity, or grant capabilities. It hosts bounded projection inputs and read models.

Compatibility posture: the package name, route names, environment bindings, and
existing import paths remain `site-registry-cloudflare` / `NARADA_SITE_REGISTRY_*`
for current callers and deployment templates. New docs should describe the
hosted surface with the four-concern vocabulary and must not use Site telemetry
publication as the Site Registry relation publication command.

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
| `POST` | `/api/site-communications/send` | message-token protected outbound Site communication record |
| `GET` | `/api/site-communications/:communication_id` | read-token protected communication status |
| `GET` | `/api/site-communications/:communication_id/receipt` | read-token protected delivery/admission receipt view |

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

## Outbound Site Communication

`POST /api/site-communications/send` records a guarded outbound communication
intent for a selected active/public Site relation. The route validates the
target Site relation, a configured HTTPS delivery endpoint, capability
reference posture, idempotency key, and raw-secret exclusion before recording
communication state in D1.

The v0 route records delivery as `recorded_not_delivered`; unit tests do not
perform live network delivery. Delivery receipts and target admission receipts
are distinct. A cloud delivery record does not mutate the target Site inbox and
does not prove target Site admission.

## Operator Communication Posture

The hosted page exposes `Message` and `Chat` actions per eligible Site tile.
Both actions are scoped to one selected Site. They do not create a registry-wide
chat surface and do not make the registry the target Site authority.

`Message` is a direct composer for a bounded typed inbox envelope. The operator
enters the send token, target delivery endpoint, capability reference, subject,
body, and message kind in the browser. The Worker receives only the submitted
request; docs, tests, D1 rows, HTML, and JSON responses must not store or echo
raw bearer token values. The composer records an outbound communication through
`/api/site-communications/send`; it does not write the target Site inbox,
change task lifecycle rows, grant capabilities, mutate Site config, or mutate
registry relation lifecycle.

Receipt labels are intentionally split:

- `delivery_receipt` is the registry/transport-side state for the outbound
  communication record. In v0 it is normally `recorded_not_delivered` because
  tests and local fixtures do not perform live delivery.
- `admission_receipt` is the target Site's local decision posture. A pending
  admission receipt means no local Site admission has been reported. Only a
  target Site finalization artifact can say admitted, rejected, deferred, or
  error for the local Site.

`Chat` is Site-scope projected intelligence. It answers from the selected
Site's published projection context: Site Registry record, freshness, relation
posture, dashboard rows already in the projection, and public/authorized receipt
summaries. It must refuse or narrow prompts asking for private task databases,
raw inbox payloads, secrets or bearer values, raw logs, unexported filesystem
state, cross-Site/registry-wide context, direct task execution, Site config
mutation, relation mutation, or capability grants.

Chat-authored messages are drafts until the operator explicitly sends them.
Draft submission uses the same `/api/site-communications/send` crossing and the
same receipt split as direct messages. No autonomous delegated-send capability
exists in this package slice.

Residuals:

- Registry-wide or cross-Site comparison chat is a future surface and must be
  specified separately before implementation.
- Delegated send without explicit operator confirmation requires a future
  governed capability and must not be inferred from the current chat UI.
- Live transport delivery remains separate from local admission and needs a
  controlled delivery task before docs can claim successful transport.

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
