# Site Telemetry Publication Outcome Shapes

This artifact defines the desired outcome shape for each Site Telemetry
Publication subchapter. It does not implement new runtime machinery or perform
Cloudflare deployment.

## Telemetry Event Contract

Outcome artifact: `site_telemetry_event_contract.v0`; concrete specification:
[`site-telemetry-event-contract.v0.md`](site-telemetry-event-contract.v0.md).

Purpose: define the crossing artifact emitted by a publisher Site and received
by a telemetry surface.

Required fields:

- `schema`, `event_id`, `idempotency_key`, `source_site_id`, optional
  `subject_site_id` / `target_site_id`;
- `family`, `type`, `observed_at`, `sent_at`;
- `auth.kind`, `auth.capability_ref`, `auth.authenticated`;
- `payload_bounds.max_bytes`, `payload_bounds.raw_values_excluded`;
- `payload_summary`;
- `freshness` or enough timestamp data for the receiver to compute freshness;
- `authority_limits`;
- `evidence_refs`.

Invariants:

- the event is a bounded telemetry artifact, not the publisher's full truth;
- raw logs, raw DB rows, raw task lifecycle dumps, and raw secrets are excluded;
- idempotency is stable across retries;
- source and subject Site identity are explicit;
- every family has a declared interpretation and non-goals.

Examples: `site_health`, `site_inbox`, `agent_session`, `task_work`,
`attention`, `report`, `site_registry`.

Residual tasks: implement package contract tests, decide whether to keep the
current runtime schema or add a new schema alias/successor, wire Publication
Edge coordinates into runtime events, and integrate compatibility with hosted
receiver decisions.

## Publication Edge And Capability Policy

Outcome artifact: `site_telemetry_publication_edge.v0`; concrete
specification:
[`site-telemetry-publication-edge.v0.md`](site-telemetry-publication-edge.v0.md).

Purpose: declare that one publisher Site may send selected telemetry families to
one telemetry surface owned by an owning Site.

Required fields:

- `edge_id`, `publisher_site_id`, `owning_site_id`, `surface_id`;
- `surface_endpoint`, `accepted_event_families`;
- `capability_refs` for publish, read, message submit, poll, finalize, admin;
- `secret_resolver_policy`;
- `trust_posture`, `revocation_posture`, `rotation_posture`;
- `evidence_refs`, `authority_limits`.

Invariants:

- a publication edge is influence/capability, not mutation authority;
- raw secret values never appear in edge records;
- accepted event families do not imply automatic admission;
- revocation and rotation are first-class lifecycle states.

Residual tasks: implement package-level edge types/validator, local config
projection, non-publishing preflight, stale/revoked credential reference checks,
and client-helper enforcement before publish.

## Telemetry Surface Realizations

Outcome artifact: `site_telemetry_surface_realization.v0`; concrete
specification:
[`site-telemetry-surface-realization.v0.md`](site-telemetry-surface-realization.v0.md).

Purpose: describe a concrete hosted or local realization of a telemetry surface.

Required fields:

- `surface_id`, `owning_site_id`, `realization_kind`;
- endpoint routes, deployment coordinates, storage bindings, migration refs;
- read/write capability refs;
- projection-store declarations;
- smoke/readiness refs;
- authority limits.

Realization kinds:

- Cloudflare Worker with KV/D1;
- local filesystem/SQLite surface;
- future hosted service or durable-object realization.

Invariants:

- route, domain, Worker name, D1 id, KV id, and process are deployment
  coordinates, not Site authority;
- realization can be replaced without changing publisher Site authority;
- projection store freshness and evidence are visible.

Residual tasks: layer current `site-registry-cloudflare` package documentation
as one telemetry surface realization, implement package-level validation, add a
local fixture realization, and add deploy hash/smoke verifier parity with
Staccato.

## Adjacent Site Registry Read Model

Outcome artifact: `site_registry_read_model.v0`; concrete specification:
[`site-registry-read-model.v0.md`](site-registry-read-model.v0.md).

Purpose: provide a queryable projection over known Sites and their relation to
the owning Site or awareness locus. This concern is adjacent to Site Operational
Telemetry: it may consume telemetry projections, but relation lifecycle writes
belong to the Site Registry command family, not telemetry publish.

Required fields:

- `site_id`, `locus_type`, roots/embodiments summary;
- `relation_posture`, `authority_boundaries`;
- telemetry endpoint, inbox/message endpoint, pub/sub posture;
- `freshness`, `health`, `capabilities`, `capability_denials`;
- provenance and source evidence refs;
- read-model authority limits.

Invariants:

- SiteRegistry is a read model first;
- registry membership does not transfer mutation authority;
- unknown or stale Sites remain explicit, not silently trusted;
- a future SiteRegistry authority substrate must be separately admitted.

Residual tasks: implement deterministic derivation helpers, integrate with User
Site awareness, specify Site Registry relation publication commands, and decide
through separate evidence whether any registry authority object is earned.

## Adjacent Remote Candidate Exchange

Outcome artifact family: `remote_candidate_message.v0`,
`remote_candidate_receipt.v0`, `remote_candidate_finalize.v0`; concrete
generic specification: [`remote-candidate-exchange.v0.md`](remote-candidate-exchange.v0.md).

Purpose: allow hosted surfaces to hold candidate messages until the receiving
Site admits, rejects, or errors locally. This concern is adjacent to Site
Operational Telemetry and Site Registry; it is the communication crossing, not a
telemetry publish path or registry relation mutation path.

Required fields:

- candidate/message id, surface id, target Site, target authority, source,
  replay key, idempotency key, kind, subject/body/payload;
- payload bounds, evidence refs, crossing coordinates, admission posture, and
  authority limits;
- cloud receipt with first/last received and retry count;
- pending/detail/list projections;
- finalization payload for admitted, rejected, deferred, expired, superseded, or
  error;
- final receipt with local admission reference when admitted.

Invariants:

- cloud receipt is not local admission;
- local admission reference is evidence only, not retroactive mutation;
- duplicate submits increment retry/idempotency posture;
- finalize capability is separate from submit and poll.
- Remote Candidate is generic; telemetry and registry surfaces may instantiate
  it but do not own or narrow the contract.

Residual tasks: align hosted Worker route names with generic contract names,
define D1 schema versioning, integrate local receiving Site proof, add package
types/validators, and prove rejection/defer ledger behavior for malformed,
unauthorized, stale, duplicate, untrusted, unsupported-kind, and raw-secret
candidates.

## Local Publisher And Puller Tools

Outcome artifact family: `site_telemetry_publish_plan.v0`,
`site_telemetry_pull_plan.v0`, `site_telemetry_run_result.v0`.

Concrete specification: [`site-telemetry-local-tools.v0.md`](site-telemetry-local-tools.v0.md).

Purpose: provide Site-local tools that publish bounded telemetry and pull hosted
candidates through the local admission boundary.

Required behaviors:

- read endpoints and capability refs from Site config/projections;
- resolve raw secrets only through an approved resolver;
- dry-run without network or mutation;
- publish bounded events without raw DB/log/secret payloads;
- pull pending candidates, create local admission plans, and finalize remotely
  only after local admission/rejection/error evidence exists;
- write bounded run evidence.

Invariants:

- tools are embodiments of Site authority, not authority themselves;
- local inbox/task mutation occurs only through local governed commands;
- scheduled operation must be declared and observable.

Residual tasks: create CLI/script wrappers, define secret resolver integration,
add scheduler posture, and prove one publisher/puller loop with fixtures.

## Telemetry Scheduler Posture

Outcome artifact family: `site_telemetry_scheduler_posture.v0`,
`site_telemetry_scheduler_doctor_summary.v0`.

Concrete specification:
[`site-telemetry-scheduler-posture.v0.md`](site-telemetry-scheduler-posture.v0.md).

Purpose: make recurring telemetry publish/pull loops visible before they act,
without creating a live scheduled task as part of specification.

Required behaviors:

- default recurring loops are disabled and observable;
- due ticks are posture, not transport authority;
- capability and credential posture block transport before command execution;
- dry-run scheduler paths record intent/result evidence without network,
  secret resolution, local inbox mutation, or remote finalization;
- Doctor projection reports freshness, failures, and next action.

Invariants:

- scheduler configuration is not capability consent;
- Doctor projection is read-only;
- dry-run evidence is not transport success;
- pull evidence is not local admission.

Residual tasks: implement substrate-specific scheduler registration only after
operator capability policy and runtime locus are admitted.

## Readiness And Operations

Outcome artifact family: `site_telemetry_readiness_report.v0`,
`site_telemetry_deploy_evidence.v0`, `site_telemetry_rollback_plan.v0`.

Concrete specification: [`site-telemetry-readiness.v0.md`](site-telemetry-readiness.v0.md).

Purpose: define how a telemetry surface becomes smoke-ready or live-deployed.

Required fields:

- readiness verdict: `unconfigured`, `contract_ready`, `locally_validated`,
  `smoke_ready`, `hosted_deployed`, `receiving_verified`,
  `publishing_verified`, `operationally_monitored`, `live_deployed`,
  `withdrawn`, or `blocked`;
- operator capability grant evidence for live deploy;
- deployment coordinates and migration evidence;
- secret binding/rotation evidence without raw values;
- smoke proof, rollback plan, monitoring owner, alert posture;
- residuals and next operational action.

Invariants:

- smoke-ready is not live-deployed;
- live deployment requires deploy evidence and post-deploy smoke;
- receiving, publishing, and monitoring are separate readiness claims;
- rollback preserves forensic evidence unless destructive cleanup is explicitly
  granted;
- production readiness is never inferred from local tests alone.

Residual tasks: implement read-only readiness report/doctor commands, deploy
wrapper, hosted smoke verifier, monitoring check, secret rotation checklist, and
ownership decision record. Monitoring ownership and rotation posture are
specified in
[`site-telemetry-operations-posture.v0.md`](site-telemetry-operations-posture.v0.md).

## Inquiry Doctrine Feedback

Outcome artifact family: `inquiry_branch_candidate.v0`,
`doctrine_lift_candidate.v0`, `concept_lifecycle_candidate.v0`.

Concrete specification:
[`site-telemetry-inquiry-doctrine-feedback.v0.md`](site-telemetry-inquiry-doctrine-feedback.v0.md).

Purpose: preserve the branch pressure created when telemetry naming exposes
missing ontology.

Required fields:

- originating pressure and question;
- branch point, open branches, closure/residual status;
- evidence refs to tasks, docs, decisions, and chat/source refs;
- proposed concept name and relation to existing doctrine;
- lift criteria and re-instantiation cases;
- dependency on Inquiry Space machinery when storage is absent.

Invariants:

- inquiry branch is not a task until ready for taskification;
- doctrine candidate is not canonical until admitted;
- implementation pressure is preserved without forcing immediate build;
- when Inquiry Space machinery is unavailable, Canonical Inbox may hold the
  branch as a fallback candidate with that limitation explicit.

Residual tasks: import current Site Telemetry Publication branch into Inquiry
Space when machinery exists, define doctrine-grounding MCP command, and connect
concept lifecycle status to future inquiry topology storage.

Doctrine grounding MCP lift:
[`site-telemetry-doctrine-grounding-mcp.v0.md`](site-telemetry-doctrine-grounding-mcp.v0.md).
