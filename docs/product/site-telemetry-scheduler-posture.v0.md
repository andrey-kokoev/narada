# Site Telemetry Scheduler Posture v0

`site_telemetry_scheduler_posture.v0` specifies the observable scheduler posture
for recurring Site Telemetry publish and pull loops.

This contract does not create a scheduler, register an operating-system timer,
or perform transport. It defines the posture and evidence a local Site scheduler
must expose before invoking the local telemetry tools described in
[`site-telemetry-local-tools.v0.md`](site-telemetry-local-tools.v0.md).

## Purpose

Recurring telemetry work must be visible before it acts. A scheduler tick may
decide that publish or pull work is disabled, not due, due, blocked, or eligible
for a dry-run. It may not infer capability consent from the presence of a timer
or endpoint.

The scheduler posture artifact gives Doctor and Operator surfaces a bounded
read model over that decision:

- whether a recurring publish or pull loop is configured;
- whether the loop is enabled or disabled by default;
- whether the loop is due at the observed tick;
- whether capability and credential references are present and fresh;
- which local telemetry command would run;
- which intent and result evidence would be recorded;
- whether network transport or local inbox mutation is allowed.

## Artifact Shape

`site_telemetry_scheduler_posture.v0` fields:

- `schema`;
- `posture_id`;
- `site_id`;
- `observed_at`;
- `scheduler_surface`;
- `loops`;
- `doctor_projection`;
- `authority_limits`;
- `evidence_refs`.

Each `loops[]` entry contains:

- `loop_id`;
- `kind`: `publish` or `pull`;
- `state`: `disabled`, `not_due`, `due`, `blocked`, `dry_run_ready`, or
  `last_run_succeeded`;
- `enabled`;
- `cadence`: interval, next due time, and last observed tick;
- `command`: local telemetry command family (`narada site-telemetry publish
  plan`, `narada site-telemetry publish run`, `narada site-telemetry pull
  plan`, or `narada site-telemetry pull run`) and arguments by reference;
- `capability_posture`: required refs, status, and blocking reasons;
- `transport_posture`: `disabled`, `dry_run_only`, or `allowed_after_preflight`;
- `local_mutation_posture`: `none`, `plan_only`, or `requires_governed_command`;
- `intent_evidence`: stable intent id, idempotency key, and evidence refs;
- `last_result`: absent, skipped, blocked, dry-run, succeeded, or failed;
- `residuals`.

## Default And Disabled State

New Site telemetry scheduler configuration defaults to disabled. A disabled loop
must still be visible to Doctor with `enabled: false`, `state: "disabled"`, and
`transport_posture: "disabled"`.

Disabled loops do not resolve capabilities, contact remote endpoints, mutate
local inbox state, finalize remote candidates, or create follow-up tasks. They
may record a bounded scheduler observation that the loop was skipped.

## Due State

A due loop means the current tick is at or after `next_due_at`. It does not mean
transport is authorized. Due loops must still pass:

- local configuration presence checks;
- declared publication edge or remote surface checks;
- capability reference presence checks;
- credential reference freshness checks;
- command-mode checks.

If the loop is due and `mode: "dry_run"`, the scheduler may invoke the local
tool's `plan` command and record plan evidence. If the loop is due and transport
is requested, transport remains blocked until capability and consent checks pass,
then uses the matching `run` command.

## Capability Blocking

Capability and credential failures are scheduler blockers, not runtime
surprises. A blocked loop records:

- which capability family blocked execution;
- whether the reference is missing, stale, revoked, or unavailable;
- whether raw secret values were recorded, always `false`;
- which command would have run if unblocked;
- remediation evidence refs or residuals.

The scheduler must not call a secret resolver for disabled loops or dry-run
planning. For transport runs, secret resolution happens only after the loop is
due and preflight has admitted the attempt.

## Intent And Result Evidence

Recurring publish/pull work records two evidence layers:

- `intent_evidence`: the scheduler's bounded decision to attempt, skip, block,
  or dry-run a loop;
- `result_evidence`: the local telemetry tool result, when a command was
  invoked.

The evidence must preserve these separations:

- scheduler due status is not permission to publish;
- publish transport success is not remote truth admission;
- pull transport success is not local inbox admission;
- local inbox mutation still requires a local governed command;
- remote finalization requires local admission, rejection, or error evidence.

Dry-run scheduler results use the local tool plan schemas
`narada.site_telemetry.publish_plan.v0` and
`narada.site_telemetry.pull_plan.v0`. Transport-capable command results use
`narada.site_telemetry.run_result.v0` after explicit capability preflight.

## Doctor Projection

Doctor surfaces should derive a compact projection:

- `freshness.status`: `fresh`, `stale`, or `unknown`;
- `configured_loops`;
- `enabled_loops`;
- `due_loops`;
- `blocked_loops`;
- `last_success_at`;
- `last_failure_at`;
- `failures`: bounded failure summaries;
- `next_action`.

Doctor may report stale telemetry when `observed_at` or `last_success_at` is
older than the configured freshness threshold. It must not repair, enable, or
run loops as a side effect of reading posture.

## Fixtures

- `docs/product/fixtures/site-telemetry-scheduler-posture/scheduler-posture.disabled.json`
- `docs/product/fixtures/site-telemetry-scheduler-posture/scheduler-posture.due.json`
- `docs/product/fixtures/site-telemetry-scheduler-posture/scheduler-posture.blocked-capability.json`
- `docs/product/fixtures/site-telemetry-scheduler-posture/scheduler-posture.successful-dry-run.json`
- `docs/product/fixtures/site-telemetry-scheduler-posture/doctor-summary.expected.json`

## Authority Limits

- Scheduler configuration is not capability consent.
- A due timer tick is not transport authority.
- Capability references may be recorded; raw secret values must not be recorded.
- Dry-run evidence is not proof that transport succeeded.
- Pull evidence is not local admission until a local governed command records
  admission, rejection, defer, or error evidence.
- Doctor projection observes posture and failures; it does not mutate scheduler
  or inbox state.
