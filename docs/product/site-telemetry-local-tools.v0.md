# Site Telemetry Local Tools v0

`site_telemetry_local_tools.v0` specifies local publisher and puller command
contracts for Site Telemetry Publication.

These tools are embodiments of the local Site. They do not become authority
owners. They may publish bounded telemetry or pull hosted candidates only under
the local Site's configured capability and admission law.

## Commands

The first wrapper family should expose these command shapes:

| Command | Purpose | Primary artifact |
| --- | --- | --- |
| `narada site-telemetry publish plan` | Build a publication plan from local config/projection without network transport. | `site_telemetry_publish_plan.v0` |
| `narada site-telemetry publish run` | Execute an admitted publish plan. | `site_telemetry_run_result.v0` |
| `narada site-telemetry pull plan` | Build a pull plan for remote SiteRegistry/candidate data without local mutation. | `site_telemetry_pull_plan.v0` |
| `narada site-telemetry pull run` | Pull hosted candidates, produce local admission plans, and optionally finalize only after local evidence exists. | `site_telemetry_run_result.v0` |

Script wrappers may exist before CLI commands, but they must emit the same
artifacts.

## Publish Plan

`site_telemetry_publish_plan.v0` fields:

- `schema`;
- `plan_id`;
- `site_id`;
- `generated_at`;
- `dry_run`;
- `publication_edge_ref`;
- `surface_endpoint_ref`;
- `capability_ref`;
- `credential_resolution`: resolver reference and credential-reference status,
  never raw secret values;
- `event_family`;
- `event_preview`: bounded event summary, redaction posture, payload byte count,
  and raw-value exclusion assertion;
- `preflight`: pass/fail checks;
- `network_publish_planned`;
- `local_mutation_planned`;
- `authority_limits`;
- `evidence_refs`.

Dry-run publish planning must set:

- `network_publish_planned: false`;
- `local_mutation_planned: false`;
- `raw_secret_values_recorded: false`.

## Pull Plan

`site_telemetry_pull_plan.v0` fields:

- `schema`;
- `plan_id`;
- `site_id`;
- `generated_at`;
- `dry_run`;
- `remote_surface_ref`;
- `read_capability_ref`;
- `poll_capability_ref`;
- `finalize_capability_ref`;
- `candidate_filters`;
- `expected_candidate_schemas`;
- `local_admission_mode`: `plan_only`, `admit_with_local_command`, or
  `disabled`;
- `finalize_mode`: `disabled`, `after_local_evidence`, or `plan_only`;
- `preflight`;
- `network_pull_planned`;
- `local_inbox_mutation_planned`;
- `remote_finalize_planned`;
- `authority_limits`;
- `evidence_refs`.

Dry-run pull planning may inspect local config/projections, but it must not
contact a remote surface, write a local inbox envelope, or finalize a remote
candidate.

## Run Result

`site_telemetry_run_result.v0` fields:

- `schema`;
- `run_id`;
- `plan_id`;
- `site_id`;
- `started_at`;
- `completed_at`;
- `status`: `succeeded`, `failed`, `partial`, `blocked_by_preflight`, or
  `dry_run`;
- `publication_intent`: requested publication, event id, and idempotency key;
- `transport_result`: skipped, attempted, succeeded, failed, status code, and
  bounded response summary;
- `pull_result`: skipped, attempted, candidate count, duplicate count, and
  bounded candidate refs;
- `local_admission_result`: skipped, planned, admitted, rejected, error, or
  deferred with local evidence refs;
- `remote_finalize_result`: skipped, attempted, succeeded, failed, and receipt
  refs;
- `stdout_stderr_policy`: digest/excerpt posture if a wrapper used subprocesses;
- `raw_secret_values_recorded: false`;
- `raw_candidate_payloads_recorded: false`;
- `authority_limits`;
- `evidence_refs`;
- `residuals`.

Publication intent, transport result, local admission result, and remote
finalization result are separate fields. A transport success cannot imply local
admission. A cloud receipt cannot imply local mutation.

## Credential And Secret Posture

- Commands store and print credential references only.
- Raw bearer tokens, API keys, passwords, cookies, and secret resolver outputs
  must not be logged, serialized, echoed, or embedded in task reports.
- Secret resolution happens only at transport time for non-dry-run commands.
- Preflight may report `credential_ref_status`, but not credential value.
- A missing, stale, or revoked credential blocks transport while still allowing
  dry-run plan output.

## Error Posture

Errors should be structured and bounded:

| Error | Meaning |
| --- | --- |
| `config_missing` | Required local config/projection is absent. |
| `preflight_failed` | Capability, endpoint, schema, freshness, or authority check failed. |
| `credential_unavailable` | Resolver or credential reference is unavailable. |
| `transport_failed` | Remote request failed after admission. |
| `candidate_malformed` | Remote candidate failed schema/admissibility checks. |
| `local_admission_failed` | Local inbox/task admission command failed. |
| `finalize_failed` | Remote finalization failed after local evidence existed. |

Failure results must include safe evidence refs and residuals, not raw response
bodies by default.

## Authority Limits

Every artifact must include authority limits equivalent to:

- `local_tool_is_site_embodiment_not_authority_owner`;
- `publish_transport_does_not_admit_remote_truth`;
- `cloud_receipt_is_not_local_admission`;
- `local_inbox_mutation_requires_local_governed_command`;
- `remote_finalize_requires_local_admission_or_rejection_evidence`;
- `raw_secret_values_must_not_be_recorded`.

## Residual Implementation Tasks

- Add CLI wrappers or scripts that emit these artifacts.
- Wire approved secret resolver references.
- Implement the recurring scheduler after the posture contract in
  [`site-telemetry-scheduler-posture.v0.md`](site-telemetry-scheduler-posture.v0.md)
  is admitted.
- Add receiving Site runtime proof for one pull/admit/finalize loop.
- Add command-run evidence integration if wrappers spawn subprocesses.
