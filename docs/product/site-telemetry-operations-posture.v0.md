# Site Telemetry Operations Posture v0

`site_telemetry_operations_posture.v0` defines operational ownership,
monitoring, alert intake, rollback, and secret rotation evidence for Site
Telemetry Publication surfaces.

This posture does not grant deployment power, raw secret access, or mutation
authority over publisher or receiver Sites. It names who watches which evidence
and which governed surface owns each follow-up.

## Ownership Roles

| Role | Owns | Does not own |
| --- | --- | --- |
| Owning Site operator | Surface policy, readiness report, monitoring owner assignment, rollback decision, and deploy capability grant. | Publisher Site truth or receiver local admission. |
| Publisher Site operator | Publication edge, publish schedule, local event bounds, and publisher capability refs. | Hosted surface storage or receiver consequences. |
| Receiving Site operator | Local pull/admit/finalize loop and local admission/rejection decisions. | Cloud receipt truth beyond remote preservation. |
| Cloudflare dashboard operator | Worker route, D1/KV bindings, Worker secrets, logs, and deployment rollback controls. | Narada Site authority or local admission. |
| Monitoring owner | Route health checks, freshness review, alert triage, and escalation. | Secret rotation or destructive rollback unless separately granted. |
| Rotation owner | Credential reference review, stale/revoked posture, and rotation evidence. | Raw secret disclosure to tasks/reports. |

For a User Site owned telemetry surface, the User Site likely owns monitoring
coordination. Narada proper or project Sites remain publishers/receivers only
through declared publication edges and candidate admission boundaries.

## Monitoring Checks

`site_telemetry_monitoring_check.v0` records:

- `check_id`;
- `surface_id`;
- `owning_site_id`;
- `checked_at`;
- `checked_by`;
- `route_health`: bounded status for `/health`, protected read routes,
  publish receiver, candidate submit, candidate poll, receipt, and finalize;
- `freshness`: latest event age, stale threshold, and stale/failing Sites;
- `storage_health`: D1/KV binding configured/readable/writeable posture;
- `capability_health`: publish/read/submit/poll/finalize/admin refs present,
  active, stale, revoked, or missing;
- `secret_rotation_posture`: no raw values, owner, last checked, next review,
  stale/revoked flags;
- `alert_posture`: no alert, warning, urgent, blocked, or withdrawn;
- `evidence_refs`;
- `authority_limits`.

Monitoring output must be bounded. It may include status codes, route names,
timestamps, event ids, and hashes. It must not include bearer tokens, API keys,
raw response bodies, raw candidate payloads, or raw logs.

## Alert Intake

Alerts are candidates until admitted by the owning Site.

| Alert | Default routing |
| --- | --- |
| Route health failure | Owning Site Canonical Inbox as `incident` or `observation`. |
| Stale publisher data | Publisher Site or owning User Site inbox, depending on publication edge. |
| Candidate backlog stale | Receiving Site inbox or task lifecycle, after local triage. |
| Credential stale/revoked | Owning Site capability/credential preflight path. |
| Raw secret exposure suspicion | CAPA candidate plus immediate containment proposal. |
| Rollback needed | Owning Site approval request; Cloudflare dashboard action only after explicit capability grant. |

Alert intake does not mutate the hosted surface by itself.

## Secret Rotation Evidence

`site_telemetry_secret_rotation_evidence.v0` records credential-reference
posture without raw values:

- `evidence_id`;
- `surface_id`;
- `owning_site_id`;
- `credential_ref`;
- `capability_kind`: publish, read, submit, poll, finalize, admin, deploy, or
  monitoring;
- `authority_locus`: User Site, project Site, Cloudflare dashboard, or another
  declared locus;
- `store_kind`: Cloudflare Worker Secret, credential manager, keychain, env,
  vault, or other resolver family;
- `operation_kind`: `bind_existing_secret`, `set_local_runtime_env`,
  `create_new_secret`, or `rotate_remote_secret`;
- `remote_secret_mutation_requested`;
- `remote_secret_mutation_approved`;
- `last_verified_at`;
- `next_rotation_due_at`;
- `status`: `fresh`, `stale`, `revoked`, `missing`, `rotating`, or `blocked`;
- `decided_by`;
- `evidence_refs`;
- `raw_secret_values_recorded: false`;
- `authority_limits`.

`create_new_secret` and `rotate_remote_secret` are external effects. They
require explicit operator approval and must not occur as incidental side effects
of readiness, monitoring, deploy, or local wrapper commands.

## Rollback Posture

Rollback is governed by the owning Site and executed through the deployment
authority surface.

`site_telemetry_rollback_plan.v0` must name:

- trigger condition;
- rollback owner;
- Cloudflare deployment coordinates;
- previous Worker version or route disable action;
- D1/KV preservation posture;
- publisher pause instruction;
- candidate intake pause instruction;
- forensic evidence refs;
- destructive cleanup approval requirement;
- post-rollback smoke expectation.

Default rollback preserves D1/KV data and logs for forensic review. Deleting D1,
KV, route, logs, or evidence requires explicit destructive cleanup authority.

## Handoff Boundaries

Operational handoff is a governed crossing:

```text
Narada proper publisher evidence
-> User Site owned telemetry surface monitoring
-> Cloudflare dashboard deployment coordinates
-> receiving Site local admission/finalization
```

Each step carries evidence, but none grants authority to the next step by
itself. Cloudflare dashboard access can deploy or rotate Worker bindings; it
cannot admit Narada inbox envelopes. User Site awareness can route and monitor;
it cannot mutate Narada proper task lifecycle. Narada proper can publish bounded
telemetry; it cannot claim hosted storage readiness without deploy evidence.

## Residual Implementation Tasks

- Implement `site-telemetry readiness doctor` monitoring checks.
- Implement alert-to-inbox submission for route health and credential posture
  without raw output.
- Add credential preflight integration for Cloudflare Worker Secret refs.
- Add rotation due/stale detection in readiness reports.
- Add rollback evidence recorder with destructive cleanup refusal by default.
