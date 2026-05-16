# Site Telemetry Surface Realization v0

`site_telemetry_surface_realization.v0` describes a concrete hosted or local
realization of a Site Telemetry Publication surface.

A Telemetry Surface is a realization/interface for receiving, storing, and
projecting bounded telemetry. It is distinct from:

- the publisher Site that emits telemetry;
- the owning Site that governs the surface policy;
- the SiteRegistry read model served by the surface;
- any single route, domain, Worker, D1 database, KV namespace, file path, or
  process.

## Schema

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | `narada.site_telemetry.surface_realization.v0`. |
| `surface_id` | yes | Stable surface identity. |
| `owning_site_id` | yes | Site that owns policy for this surface. |
| `realization_kind` | yes | `cloudflare_worker_kv_d1`, `local_filesystem`, `local_sqlite`, or future hosted kind. |
| `surface_role` | yes | Human-readable role such as `user_site_awareness_surface` or `project_telemetry_surface`. |
| `package_ref` | yes | Deployable package or local tool reference. |
| `routes` | yes | Receive/read/message/health routes or local command/file coordinates. |
| `storage_bindings` | yes | Projection/event/message storage coordinates. |
| `config_coordinates` | yes | Config file, environment binding, or Site config coordinates. |
| `capability_refs` | yes | Read/write/message/admin capability references, not raw secrets. |
| `readiness_evidence_refs` | yes | Smoke, build, migration, deployment, or fixture proof references. |
| `projection_models` | yes | Read models served by the surface, such as `site_registry_read_model.v0`. |
| `authority_limits` | yes | Non-empty limits proving deployment coordinates are not Site authority. |

## Realization Kinds

| Kind | Use |
| --- | --- |
| `cloudflare_worker_kv_d1` | Hosted Worker surface using KV for latest projections and D1 for audit/message rows. |
| `local_filesystem` | Local fixture or development surface using files as projection artifacts. |
| `local_sqlite` | Local fixture or runtime surface using SQLite as projection substrate. |
| `future_hosted_service` | Placeholder for a future hosted service; not runtime-ready until separately specified. |

## Naming Rules

- A name such as `narada-repo-site-registry` may identify a repo-owned
  telemetry surface or SiteRegistry read-model route, not the authority locus of
  every Site it displays.
- Prefer `site-telemetry-surface` or `site-telemetry-publication` when naming
  the deployable realization. Use `site-registry` only for a route/read-model
  purpose inside the surface.
- Domain, Worker name, D1 id, KV id, route, file path, or process name must be
  recorded as deployment coordinates.
- The owning Site must be explicit; route names and package names do not imply
  ownership.

## Cloudflare Variant

A Cloudflare realization declares:

- Worker/package reference;
- route table: health, webhook receive, projection reads, message submit/poll,
  message detail/receipt/finalize;
- KV binding for latest projections and event/idempotency records;
- D1 binding for audit and remote candidate message rows;
- migration refs and smoke/build refs;
- Wrangler config reference without raw account, zone, secret, D1, or KV values
  in committed docs;
- capability references for publish/read/message/poll/finalize/admin.

## Local Fixture Variant

A local realization declares:

- a file or SQLite root scoped to local fixture data;
- receive/replay command or file-drop coordinate;
- projection output path or table names;
- no network transport by default;
- fixture evidence proving the same event contract and read-model expectations
  without Cloudflare resources.

## Residual Implementation Tasks

- Rename or layer `@narada2/site-registry-cloudflare` docs so the package is
  presented as one Telemetry Surface realization with SiteRegistry as a read
  model.
- Add package-level surface realization types and validation.
- Add a local filesystem/SQLite fixture realization.
- Add smoke/readiness evidence that compares Cloudflare and local fixture
  behavior.
- Add deploy hash and post-deploy smoke evidence for live Cloudflare readiness.
- Decide the first owning Site and public domain naming separately from the
  deployable package name.
