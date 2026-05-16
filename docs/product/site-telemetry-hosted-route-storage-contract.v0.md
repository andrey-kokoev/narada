# Site Telemetry Hosted Route And Storage Contract v0

This contract applies to the first Narada proper Site Telemetry Publication live
slice defined in [`site-telemetry-first-live-slice.v0.md`](site-telemetry-first-live-slice.v0.md).
It describes the hosted Cloudflare route and projection storage contract before
any live resource creation or deployment.

## Identity

| Field | Value |
| --- | --- |
| Surface id | `narada-proper-site-telemetry-publication-v0` |
| Owning Site | `narada-proper` |
| Realization package | `@narada2/site-registry-cloudflare` |
| Worker compatibility name | `narada-site-registry` |
| Binding prefix | `NARADA_SITE_REGISTRY_*` |
| Mode | `projection_only` |

`site-registry` names remain compatibility names for the package, bindings,
route schemas, and worker template. Product documentation should describe the
deployed object as a Site Telemetry Surface realization whose SiteRegistry is a
read model.

## Cloudflare Bindings

| Binding | Kind | Required for | Posture |
| --- | --- | --- | --- |
| `NARADA_SITE_REGISTRY_KV` | KV namespace | Event projection, idempotency, latest read models | Projection store, not Site authority. |
| `NARADA_SITE_REGISTRY_D1` | D1 database | Event audit and remote candidate exchange | Candidate/audit store, not inbox/task authority. |
| `NARADA_SITE_REGISTRY_READ_TOKEN` | Worker secret | Per-Site projection detail | Capability-bearing secret. |
| `NARADA_SITE_REGISTRY_PUBLISH_TOKEN` | Worker secret | `POST /webhook` | Capability-bearing secret. |
| `NARADA_SITE_REGISTRY_MESSAGE_TOKEN` | Worker secret | `POST /api/messages` | Capability-bearing secret. |
| `NARADA_SITE_REGISTRY_POLL_TOKEN` | Worker secret | Message poll/detail/receipt routes | Capability-bearing secret. |
| `NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN` | Worker secret | Finalization route | Capability-bearing secret. |
| `NARADA_SITE_REGISTRY_ADMIN_TOKEN` | Worker secret | Reserved/admin posture | Capability-bearing secret. |

Non-secret vars:

- `NARADA_SITE_REGISTRY_MODE=projection_only`;
- `NARADA_SITE_REGISTRY_KNOWN_SITE_IDS`;
- `NARADA_SITE_REGISTRY_MAX_PAYLOAD_BYTES`;
- `NARADA_SITE_REGISTRY_EVENT_CAPABILITY_REF`.

Worker name, route/domain, D1 database id/name, KV namespace id/name, account
id, and zone id are deployment coordinates only if admitted by the coordinate
and secret posture task. Raw token values are never repo-visible.

## Route Contract

| Method | Route | Auth | Success schema | Failure/refusal posture |
| --- | --- | --- | --- | --- |
| `GET` | `/` | None | HTML human peek shell | No mutation; no tokens or raw payloads embedded. |
| `GET` | `/health` | None | `narada.site_registry_cloudflare.health.v0` | Reports binding/token configured booleans only. |
| `POST` | `/webhook` | `NARADA_SITE_REGISTRY_PUBLISH_TOKEN` | `narada.site_registry_cloudflare.webhook_response.v0` | Refuses invalid auth, unknown Site, unsupported family, oversized payload, raw secret marker, missing KV. |
| `GET` | `/api/sites` | None | `narada.site_registry_cloudflare.sites_response.v0` | Bounded summary from projection state only. |
| `GET` | `/api/freshness` | None | `narada.site_registry_cloudflare.freshness_response.v0` | Bounded freshness summary only. |
| `GET` | `/api/projections/:site_id` | `NARADA_SITE_REGISTRY_READ_TOKEN` | `narada.site_registry_cloudflare.projection_response.v0` | Refuses invalid read token or unknown Site; missing projection returns `404`. |
| `POST` | `/api/messages` | `NARADA_SITE_REGISTRY_MESSAGE_TOKEN` | `narada.remote_candidate.submit_response.v0` | Refuses invalid auth, missing D1, missing idempotency, invalid target authority, missing crossing/admission posture, raw secret markers. |
| `GET` | `/api/messages/pending` | `NARADA_SITE_REGISTRY_POLL_TOKEN` | `narada.remote_candidate.pending_response.v0` | Refuses invalid auth or missing D1. |
| `GET` | `/api/messages/:message_id` | `NARADA_SITE_REGISTRY_POLL_TOKEN` | `narada.remote_candidate.detail_response.v0` | Refuses invalid auth or unknown message. |
| `GET` | `/api/messages/:message_id/receipt` | `NARADA_SITE_REGISTRY_POLL_TOKEN` | `narada.remote_candidate.receipt_response.v0` | Refuses invalid auth or unknown message. |
| `POST` | `/api/messages/:message_id/finalize` | `NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN` | `narada.remote_candidate.finalize_response.v0` | Refuses invalid auth, missing D1, unknown message, or invalid finalization payload. |

All JSON route responses must preserve no-authority fields where implemented:

- `projection_only`;
- `mutates_site=false`;
- `admits_inbox=false`;
- `mutates_task_lifecycle=false`;
- `certifies_identity=false`;
- `grants_capability=false`.

## D1 Contract

Migration `0001_site_event_projection.sql` creates:

- `site_registry_event_audit`: event id, idempotency key, source/subject Site,
  family, status, refusal reasons, observed/recorded timestamps;
- `site_registry_remote_messages`: remote candidate state keyed by message id
  and unique source/idempotency pair;
- `site_registry_remote_message_events`: candidate submit, duplicate, finalize,
  and refusal event metadata.

D1 is authoritative only for the hosted surface's bounded audit/candidate
projection. It is not canonical inbox, task lifecycle, Site config, Site
lineage, or capability authority.

## KV Contract

KV stores:

- `site-registry:event:<event_id>` redacted event records;
- `site-registry:site-events:<site_id>` redacted per-Site event lists;
- idempotency records for accepted events;
- `site-registry:projection:<site_id>` latest derived projection read models.

KV freshness is projection freshness. It does not override local Site state or
admit downstream consequences.

## Response And Payload Bounds

The live surface must:

- reject request bodies above `NARADA_SITE_REGISTRY_MAX_PAYLOAD_BYTES` or the
  default max;
- require `payload_bounds.raw_values_excluded=true` for telemetry/candidate
  contracts that carry payload summaries;
- omit raw bearer token values from responses, KV, D1, task reports, and smoke
  artifacts;
- store only bounded summaries, evidence refs, refusal reasons, and read-model
  projections;
- treat duplicate idempotency keys as duplicate projection/candidate events, not
  as new local Site actions.

## Migration Posture

For the first live deploy, the D1 migration is additive and creates only the
hosted projection/candidate tables above. Running migration output is deployment
evidence, not proof of local Site admission. Rollback must preserve forensic
evidence unless destructive cleanup is separately authorized.

## Naming Drift And Residuals

Known compatibility drift:

- package name: `@narada2/site-registry-cloudflare`;
- Worker template name: `narada-site-registry`;
- health schema prefix: `narada.site_registry_cloudflare.*`;
- human shell title: `Narada Site Registry`;
- env/binding prefix: `NARADA_SITE_REGISTRY_*`.

This drift is acceptable for the first live slice only because this contract and
the first-live-slice artifact state the product reading explicitly. A later
cleanup may add neutral Site Telemetry aliases, but it must preserve current
callers or include a migration plan.

## Deployment Gate

Tasks that replace bindings, run deploy preflight, deploy, or smoke verify must
cite this contract and the first-live-slice artifact. If actual Cloudflare
routes or bindings differ, deployment must stop and update this contract or
record a blocker before live mutation.
