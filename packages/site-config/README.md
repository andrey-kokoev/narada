# @narada2/site-config

Descriptor contracts for Site registry awareness and read-only registered Site probe reports.

This package models known-Site registry entries, capability edges/denials, probe requests, probe reports, and refusal behavior. It does not mutate target Site config, scan arbitrary client/project files, import target task/inbox DBs, copy secrets, or grant authority from relationship labels.

## First Slice

- Validate local Site registry awareness entries.
- Distinguish relationship labels from explicit capability edges.
- Build read-only registered Site probe reports.
- Refuse unregistered roots without explicit basis, target mutation, arbitrary scans, runtime state import, and credentials.

Receiving Sites own their own config files, probe execution, trust records, MCP registration, and target-rooted mutation authorities.

## Inbox Location Checks

Site config may declare whether remote inbox locations should be checked at all
and which bounded locations are eligible for checking:

- `check_remote_inbox_locations`: boolean posture. When false, declared enabled
  locations are ignored and no poll/check plan is produced.
- `inbox_locations`: list of local file drops, HTTP poll endpoints,
  Cloudflare Worker inbox surfaces, Site pub/sub locations, or disabled entries.

Remote HTTP and Cloudflare locations require an endpoint and an
`auth_capability_ref`. The config records capability references and authority
limits, not raw bearer tokens. Location checks are read/poll posture only: they
do not mutate target Site config, grant remote inbox authority, import remote
runtime state, or admit messages without the receiving Site's canonical inbox
admission path.

## Site Telemetry

Site telemetry is bounded, read-only, freshness-tagged observation evidence
from Site runtimes, daemons, adapters, and carrier surfaces. It may describe
health, posture, projections, traces, operator attention, stabilization,
durable Agent embodiment, carrier session, current governed work posture, last
governed action, projected capability refs, grant refs, and bounded status.

Telemetry is not authority. It cannot assign work, grant capabilities, certify
identity, admit inbox/task state, close tasks, review work, mutate Site config,
or become raw runtime authority.

New Site configs default `enable_telemetry` to true with a local bounded
destination. `telemetry_destinations` are declarations of where bounded
telemetry may land. `transport` is separate from destination and declares the
mechanism, such as `local_append`, `sqlite_insert`,
`operator_surface_projection`, `bearer_https_post`, or `site_pubsub_signal`.

Remote webhook/Cloudflare telemetry destinations are disabled unless explicitly
configured by operator policy. They require a bearer capability reference, not
a raw token, and must declare accepted event families, freshness posture,
redaction bounds, storage posture, and authority limits. A remote projection
cannot override local freshness/authority records or become Site authority.

## Site Registry Projection And Typed Events

The Site Registry projection contract represents a collection of known Sites
without becoming any Site's authority. A projected Site record carries
`site_id`, locus/substrate, registry status, relation, freshness/health,
event endpoint posture, inbox/message endpoint posture, capabilities, evidence,
and authority limits.

Typed Site events are bounded projection inputs for HTTP webhook,
Cloudflare Worker, local, or pub/sub receivers. Event envelopes include source
and subject/target Site ids, event family/type, event id, idempotency key,
observed/sent timestamps, capability/auth posture, payload bounds, payload
summary, and authority limits. Receiver decisions can accept a projection event
or refuse unknown Sites, unsupported families, missing authentication,
oversized payloads, raw-value leakage, or missing authority limits.

Projection read models derive current Site health, inbox availability,
agent/session posture, task/work posture, attention, reports, freshness, and
event provenance from accepted events. They are read models only: stale, fresh,
missing, or failing projection state cannot assign work, mutate Site config,
admit inbox/task state, certify identity, or grant capabilities.

Human peek UI/API surfaces read the projection state through bounded routes
such as `GET /`, `GET /api/sites`, and `GET /api/projections/:site_id`. They
are not Site-local authority and cannot become task lifecycle, identity,
capability, or inbox admission surfaces.

The Staccato Cloudflare Worker pattern is lifted as reusable structure:
bearer-capability guarded webhook receipt, typed event validation before
projection, latest projection read APIs, a bounded human peek surface,
message receipt projection, local admission pullback before inbox authority,
and capability audit without raw token storage. Staccato event type names,
dashboard rows, report tabs, KV/D1 binding names, and secret environment
variable names remain Staccato-specific.
