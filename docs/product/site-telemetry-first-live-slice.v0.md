# Site Telemetry Publication First Live Slice v0

This artifact defines the first live Site Telemetry Publication slice for Narada
proper. It is a semantic and admission gate for deployment work; it is not a
Cloudflare deployment record, Site configuration mutation, or capability grant.

## Scope

| Field | Value |
| --- | --- |
| Slice id | `narada-proper-site-telemetry-publication-v0` |
| Owning Site | `narada-proper` |
| Initial publisher Site | `narada-proper` |
| Initial target Site for remote candidates | `narada-proper` |
| Surface realization | Cloudflare Worker package `@narada2/site-registry-cloudflare` |
| Read model component | SiteRegistry projection |
| Readiness target before deploy | `smoke_ready` -> `hosted_deployed` -> `receiving_verified` |

The package keeps `site-registry-cloudflare` names and
`NARADA_SITE_REGISTRY_*` bindings for compatibility. Product language should
read this as a hosted Site Telemetry Surface realization with SiteRegistry as
one read model.

## First Live Slice

The first live slice consists of three projection-only capabilities:

1. Site telemetry event receiver.
2. Remote candidate message receiver.
3. SiteRegistry read projection over accepted telemetry and candidate posture.

It does not run Narada Cycles, own Site truth, mutate task lifecycle, admit
canonical inbox envelopes, certify identity, grant capability, or perform local
Site configuration changes.

## Admissible Event Families

The receiver may admit bounded `narada.site_event.envelope.v0` compatibility
payloads and `narada.site_telemetry.event.v0` payloads for these families:

- `site_health`
- `site_inbox`
- `agent_session`
- `task_work`
- `attention`
- `report`
- `site_registry`

Admission means the hosted surface may accept the event as projection input. It
does not mean the publisher's statement becomes Site truth for the receiving
Site or for Narada proper.

Event acceptance requires:

- known `source_site_id` / subject or target Site where applicable;
- accepted family;
- idempotency key;
- bounded payload summary;
- `payload_bounds.raw_values_excluded = true`;
- authority limits;
- authenticated publication capability when the live surface is protected;
- no raw secrets, raw logs, raw database rows, raw transcripts, or runtime dumps.

## Remote Candidate Payloads

The remote message receiver may admit:

- `narada.remote_candidate.message.v0`;
- compatibility `narada.site_inbox.remote_message.v0`;
- finalization payloads shaped as `narada.remote_candidate.finalize.v0` or
  `narada.site_inbox.remote_finalize_payload.v0`.

Remote candidates are cloud state with `remote_surface_authority =
"candidate_only"`. They target local authority such as `canonical_inbox` but do
not perform that admission. A finalization may reference local admission,
rejection, or error evidence only after the local Site has acted.

## Routes

| Method | Route | Posture |
| --- | --- | --- |
| `GET` | `/` | Human peek projection shell; no authority mutation. |
| `GET` | `/health` | Public or bounded health; projection-only. |
| `POST` | `/webhook` | Publish-token protected Site telemetry event receiver. |
| `GET` | `/api/sites` | Bounded SiteRegistry summary projection. |
| `GET` | `/api/freshness` | Bounded freshness projection. |
| `GET` | `/api/projections/:site_id` | Read-token protected per-Site projection. |
| `POST` | `/api/messages` | Message-submit-token protected remote candidate submission. |
| `GET` | `/api/messages/pending` | Poll-token protected candidate listing. |
| `GET` | `/api/messages/:message_id` | Poll-token protected candidate detail. |
| `GET` | `/api/messages/:message_id/receipt` | Poll-token protected receipt detail. |
| `POST` | `/api/messages/:message_id/finalize` | Local-admission-token protected finalization reference. |

Bearer token values are capability-bearing secrets and must never be echoed in
responses, committed config, reports, smoke artifacts, task reports, or logs
admitted as evidence.

## Authority Limits

Every deployment, smoke, and readiness artifact for this slice must preserve
these limits:

- `site_telemetry_surface_is_projection_only`;
- `site_registry_is_read_model_not_site_authority`;
- `cloud_receipt_is_not_local_admission`;
- `d1_kv_projection_is_not_site_truth`;
- `remote_candidate_does_not_mutate_task_lifecycle`;
- `remote_candidate_does_not_grant_capability`;
- `deployment_coordinates_are_not_site_authority`;
- `secret_refs_are_not_raw_secret_values`.

## Storage Posture

D1 stores bounded event audit rows, remote candidate rows, and candidate event
metadata. KV stores latest projection records, idempotency records, per-Site
event lists, and current read models.

D1 and KV are projection/candidate substrates for this slice. They are not
Narada proper task lifecycle, canonical inbox, lineage, Site config, or
capability authority.

## Refusal Posture

The surface must refuse rather than silently widen when it sees:

- missing or invalid bearer capability where required;
- unknown Site ids;
- unsupported event families;
- oversized payloads;
- missing idempotency;
- raw secret markers or raw value markers;
- remote candidate payloads without crossing/admission posture;
- remote candidates whose target authority is not supported;
- missing authority limits.

Refusals may be recorded as bounded audit/projection evidence. Refusal does not
repair or mutate the publisher or target Site.

## Deployment Gate

Tasks that create Cloudflare resources, replace bindings, deploy, smoke verify,
or connect Site config must cite this artifact. If later work needs a broader
surface, a different owning Site, multi-Site federation, or a real SiteRegistry
authority substrate, it must create a new boundary artifact before deployment.
