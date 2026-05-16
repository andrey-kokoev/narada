# Site Telemetry Readiness v0

`site_telemetry_readiness.v0` defines the readiness state machine and evidence
requirements for a Site Telemetry Publication surface.

Readiness is evidence posture. It is not deployment authority, Site authority,
capability consent, or proof that local admission has occurred.

## Rule

```text
Local proof can make a surface smoke-ready.
Only live deployment evidence can make it live-deployed.
Only receiving/publishing evidence can make it operational.
```

## Readiness States

| State | Meaning | May claim |
| --- | --- | --- |
| `unconfigured` | No complete surface realization, publication edge, route, storage, or capability-reference posture exists. | Nothing beyond design intent. |
| `contract_ready` | Product contracts, schemas, fixtures, and authority limits are specified. | Implementers have a target contract. |
| `locally_validated` | Package tests, typecheck/build, fixture smoke, and no-live-network proof pass locally. | The realization works in local/non-live conditions. |
| `smoke_ready` | Local validation plus deploy runbook, migration plan, rollback plan, and secret-reference posture are present. | The surface is ready for an operator-approved live deployment attempt. |
| `hosted_deployed` | Worker/route/storage bindings are deployed and deployment evidence is recorded. | A hosted interface exists at declared coordinates. |
| `receiving_verified` | Post-deploy smoke proves protected receiving routes accept/refuse bounded telemetry and remote candidates correctly. | The hosted surface can receive under its route law. |
| `publishing_verified` | At least one publisher Site has an active publication edge and successful bounded publish result. | A publisher can send bounded telemetry through declared capability refs. |
| `operationally_monitored` | Monitoring owner, alert posture, freshness checks, credential rotation posture, and rollback readiness are recorded. | The surface is operational, observed, and owned. |
| `live_deployed` | Hosted deployed, receiving verified, publishing verified, and operationally monitored evidence are all current. | Live readiness for the declared surface scope. |
| `withdrawn` | Previously valid readiness was intentionally removed or superseded. | Historical readiness only. |
| `blocked` | A named blocker prevents state advancement. | No higher readiness until blocker evidence is resolved. |

The states are monotonic only within one readiness report. A later report may
withdraw, block, or downgrade readiness when evidence expires, credentials are
revoked, routes change, storage bindings drift, or smoke proof fails.

## Evidence Requirements

| Evidence | Required for | Notes |
| --- | --- | --- |
| Surface realization contract | `contract_ready` | Names surface id, owning Site, realization kind, routes, storage bindings, and authority limits. |
| Event, publication edge, remote candidate, and local tool contracts | `contract_ready` | Contract readiness is incomplete if any crossing artifact lacks authority limits. |
| Fixture JSON parse and package tests | `locally_validated` | Must be bounded and local. No Cloudflare publish or live external mutation. |
| Typecheck/build evidence | `locally_validated` | Build success is implementation evidence, not live readiness. |
| Non-live smoke proof | `locally_validated` | Proves health, auth refusal, event projection, candidate submit/poll/finalize/receipt, and no raw secret echo. |
| Deployment runbook | `smoke_ready` | Must include setup, deploy gate, post-deploy smoke, rollback, and raw-secret exclusion. |
| Migration plan and storage binding declarations | `smoke_ready` | D1/KV ids may be referenced as deployment coordinates; raw credentials stay out of repo evidence. |
| Secret-reference and rotation posture | `smoke_ready` and above | Records refs/status/owner/next rotation, never raw values. |
| Operator capability grant for deploy | `hosted_deployed` | Required before live deploy. Local tests cannot substitute for this grant. |
| Worker version, route URL, D1/KV binding evidence, migration output refs | `hosted_deployed` | Deployment coordinates do not make the surface Site authority. |
| Post-deploy route health | `receiving_verified` | `GET /health` and protected routes must prove projection-only authority posture. |
| Post-deploy receiver smoke | `receiving_verified` | Bounded telemetry and remote candidate routes must accept valid input and refuse invalid/unauthorized input without token echo. |
| Publisher edge preflight and publish result | `publishing_verified` | Transport success remains separate from receiver-side admission and local Site admission. |
| Monitoring owner and alert posture | `operationally_monitored` | Names who watches freshness/failure signals and what action is expected. |
| Credential rotation evidence | `operationally_monitored` | Records status and next review date; does not reveal secret values. |
| Rollback plan currentness | `operationally_monitored` | Rollback preserves forensic evidence unless destructive cleanup is explicitly granted. |

## Readiness Report Shape

`site_telemetry_readiness_report.v0` fields:

- `schema`;
- `report_id`;
- `surface_id`;
- `owning_site_id`;
- `generated_at`;
- `state`;
- `state_basis`: list of evidence checks with `pass`, `fail`, `stale`, or
  `not_applicable`;
- `deployment_coordinates`: Worker name, route, D1/KV binding refs, and
  migration refs when present;
- `capability_posture`: deploy, publish, read, submit, poll, finalize, admin,
  and monitoring capability refs/statuses;
- `secret_rotation_posture`: owner, last checked, next review, stale/revoked
  flags, and no raw values;
- `route_health`: bounded route status summaries;
- `storage_binding_health`: D1/KV configured, migrated, readable, and writable
  posture;
- `smoke_proof_refs`;
- `monitoring_posture`;
- `rollback_plan_ref`;
- `authority_limits`;
- `residuals`;
- `next_operational_action`.

## Read-Only Surfaces

Readiness should be exposed by read-only report/doctor commands before any live
deployment wrapper exists:

```text
narada site-telemetry readiness report --surface <surface-id>
narada site-telemetry readiness doctor --surface <surface-id>
narada site-telemetry readiness explain --surface <surface-id>
```

These commands may read local config, package metadata, fixture evidence,
deployment evidence records, and bounded route-health evidence. They must not
deploy, migrate, rotate secrets, publish telemetry, poll candidates, finalize
receipts, or mutate local inbox/task state.

## Authority Limits

Every readiness report must include limits equivalent to:

- `readiness_report_is_evidence_posture_not_deployment_authority`;
- `smoke_ready_is_not_live_deployed`;
- `deployment_coordinates_are_not_site_authority`;
- `cloud_receipt_is_not_local_admission`;
- `secret_refs_are_not_raw_secret_values`;
- `monitoring_projection_does_not_mutate_surface_or_site`;
- `rollback_requires_explicit_operator_authority_for_destructive_cleanup`.

## Residual Implementation Tasks

- Implement read-only readiness report/doctor commands.
- Implement deploy wrapper that refuses without operator deploy capability.
- Add hosted smoke verifier that records bounded response metadata only.
- Add monitoring owner and alert posture checks using
  [`site-telemetry-operations-posture.v0.md`](site-telemetry-operations-posture.v0.md).
- Add credential rotation checklist and stale/revoked credential checks using
  [`site-telemetry-operations-posture.v0.md`](site-telemetry-operations-posture.v0.md).
- Add rollback evidence recorder that preserves forensic storage by default.
