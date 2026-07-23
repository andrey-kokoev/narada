# Site Operating Loop Runtime Contract

## Purpose

This document defines the implementation-facing runtime contract for generic Narada Site Operating Loops.

The concept document [`site-operating-loop.md`](site-operating-loop.md) defines what a Site Operating Loop is. This document defines the contract implementation code should converge on: package ownership, loop module boundary, runtime hosting, trigger admission, event subscription, health/status projections, and verification expectations.

A Site Operating Loop runtime is the Narada-owned runtime contract for durable, machine-addressable Site control loops. It is not a Site-specific source adapter, agent, carrier, daemon, prompt, task, directive, or UI.

## Package Authority

Canonical package:

```text
@narada2/site-operating-loop
```

Canonical binary:

```text
narada-site-loop
```

Canonical exports:

| Export | Owns |
| --- | --- |
| `@narada2/site-operating-loop/site-loop-store` | Durable loop store, runtime-host authority/lease, runs, steps, locks, health, control, runtime events, triggers, attention, directive outcomes. |
| `@narada2/site-operating-loop/runner` | One bounded Loop Run over a Site-provided step list. |
| `@narada2/site-operating-loop/runtime` | Recurring runtime host that checks control state, claims triggers, executes bounded runs, and records runtime events. |
| `@narada2/site-operating-loop/server` | Local HTTP/SSE attachment surface over one Site loop store. |
| `@narada2/site-operating-loop/loop-module` | Validation of Site-owned loop body modules and step records. |
| `@narada2/site-operating-loop/policy` | Generic policy loading, merging, validation, and quiet-hours helpers. |
| `@narada2/site-operating-loop/state` | Pure run, trigger, and health lifecycle guards and transition evidence. |
| `@narada2/site-operating-loop/runtime-host-state` | Pure Site Operating Runtime Host lifecycle FSM and transition guards. |

## Layer Shape

The Site Operating Loop runtime sits below Site-specific source/admission code and above durable loop evidence:

```text
operator / automation / webhook / scheduler
  -> generic trigger admission or cadence wakeup
  -> Site Operating Loop runtime
  -> Site-owned loop module
  -> bounded Loop Run
  -> durable run/step/event/trigger/health evidence
  -> optional Site-owned emissions and receipts
```

Load-bearing boundaries:

| Layer | Owns | Does not own |
| --- | --- | --- |
| Site loop runtime | Cadence, trigger claiming, pause checks, locks, bounded run execution, runtime events, health/control projections. | Source adapters, domain decisions, effect admission, resident identity. |
| Site loop module | Concrete observation, decision, emission-preparation, and receipt-reconciliation steps for one Site loop. | Runtime hosting, durable schema migration, generic HTTP/SSE protocol. |
| Store module | Opening the Site-local SQLite database and calling `ensureSiteLoopTables(db)`. | Domain step generation or runtime cadence. |
| HTTP/SSE server | Local attachment over loop health/status/events/triggers/runs and generic control/trigger admission. | Executing steps, interpreting domain policy, or admitting domain emissions. |
| Site-specific authority surfaces | Domain-specific admitted mutations and effect confirmation. | Runtime liveness, loop locking, or generic trigger lifecycle. |

## Site Operating Runtime Host

The generic runtime is itself a first-class **Site Operating Runtime Host**. This
is the Site-loop analogue of the Narada Agent Runtime Server, but it is not an
Agent Runtime Server and it does not host agent turns. The host is the durable,
single-authority process boundary that makes a Site loop operational across CLI,
scheduler, service, HTTP/SSE, and future projection attachments.

The host owns:

- a stable `runtime_id` for the logical host of one loop;
- an incrementing `authority_epoch` for each authority claim or takeover;
- an owner lease that prevents two live supervisors from executing the same loop;
- lifecycle state and durable lifecycle history;
- host health/control attachment through the generic store and server;
- durable host claim and lifecycle events, including cursor-readable event ids;
- restart/takeover evidence without silently creating a second logical host.

The host lifecycle is:

```text
created -> binding -> ready -> serving -> closing -> stopped
                 |       |        |         |
                 +-------+--------+---------+-> failed -> closing -> stopped
```

`ready` means the generic host has bound its Site store and loop contract. It is
deliberately not NARS's `projections_ready`: a Site loop can execute without an
HTTP/SSE projection, while projection readiness belongs to the optional server
adapter. A host lease is different from a per-run lock: the host lease prevents
duplicate authorities, while the run lock prevents overlapping bounded runs
inside the admitted host.

The durable host record is `site_loop_runtime_hosts`, projected in `status` and
`health` as `runtime_host`. A new supervisor may reclaim a stopped or failed
host, retaining its logical `runtime_id` and incrementing `authority_epoch`.
An active host with an unexpired lease refuses a second authority. Every
takeover, lease heartbeat, and lifecycle transition must remain attributable to
the runtime id, epoch, owner, and timestamp. The claim API returns a structured
claim receipt containing both the host snapshot and its persisted
`runtime_host_claimed` event, so an attached observer can render authority
acquisition before binding begins.

The canonical relation to NARS is therefore:

```text
Site authority
  -> Site Operating Runtime Host
  -> bounded Loop Runs / triggers
  -> Site-owned loop module and effects
  -> loop evidence and projections

Agent identity
  -> Narada Agent Runtime Server
  -> Agent Session / turns / provider / MCP
  -> agent-cli, agent-tui, agent-web-ui projections
```

The two hosts may coordinate, but neither is a substitute for the other. A
Site loop may request or reconcile agent work through an admitted Site-owned
step; it must not smuggle resident identity, provider selection, or NARS session
semantics into the generic loop host.

Existing Site-specific supervisors, including the `site-loop-mcp` surface, are
adapters during migration. They may own domain adapters and Site policy, but
they must not define a competing generic host lifecycle, lease, or authority
schema. The canonical generic host and its `site_loop_runtime_hosts` record are
the reference shape; an adapter either delegates to that host or documents a
bounded migration bridge before it becomes a second authority.

## Loop Module Contract

A Site-owned loop body is a JavaScript module that exports one step factory:

```js
export function createSiteOperatingLoopSteps(context) {
  return [
    { stepId: 'observe', execute: () => ({ ok: true }) },
    { stepId: 'decide', execute: () => ({ decision: 'noop' }) },
  ];
}
```

Compatibility alias:

```js
export function createSteps(context) {}
```

Optional summary hook:

```js
export function summarizeSiteOperatingLoopRun({ steps, trigger }) {
  return { step_count: steps.length, trigger_id: trigger?.trigger_id ?? null };
}
```

Optional preparation hook:

```js
export async function prepareSiteOperatingLoopRun(context) {
  return { observed: true };
}
```

The runtime calls the preparation hook once per active cycle after trigger claim
and before step creation. The returned value is supplied to step creation and run
summary as `context.prepared`. Preparation is for cycle-local observation or
compatibility materialization; durable loop evidence still belongs in the phase
steps returned by `createSiteOperatingLoopSteps()`.

The generic contract validator is `resolveSiteOperatingLoopModule()` from `@narada2/site-operating-loop/loop-module`.

Minimum step shape:

| Field | Meaning |
| --- | --- |
| `stepId` | Stable step id within the loop body. Required. |
| `execute()` | Optional function that performs the step and returns evidence. |
| `inputRefs` | Optional array or function producing lineage input refs. |
| `outputRefs` | Optional array or function producing lineage output refs. |
| `evidence` | Optional static evidence or function mapping execution result to evidence. |
| `status` | Optional explicit step status; defaults to `ok` when execution succeeds. |

Step execution receives a step context:

```js
execute({ loopId, runId, stepId, dryRun, priorSteps, resultsByStepId })
```

`inputRefs`, `outputRefs`, and `evidence` functions receive `(result, context)`.
This lets native phase implementations consume prior phase outputs without using
module-global state or closure-only side channels. The runtime still records each
phase as a separate durable step.

The runtime validates that the factory returns an array of step objects with `stepId`. It records invalid factories as ordinary failed loop evidence through the synthetic `runtime.create_steps` step.

During migration from a bespoke Site loop, a loop module may materialize the existing loop once and expose the existing loop's internal phases as generic runtime-recorded phase steps. That bridge is acceptable only when the generic runtime records the phases as first-class durable step records with stable ids, status, lineage refs, and evidence. A single opaque wrapper step is not the target shape for a first-class Site Operating Loop.

## Store Module Contract

A store module opens the Site-local database and returns a store object:

```js
export function openSiteLoopStore(siteRoot) {
  const db = new DatabaseSync(siteDbPath(siteRoot));
  ensureSiteLoopTables(db);
  return { db, close() { db.close(); } };
}
```

The generic CLI requires `--store-module` and never guesses Site database ownership.

## Runtime Protocol

The stable runtime protocol is a command/event contract. Current projections are CLI and local HTTP/SSE.

Minimum operations:

| Operation | CLI | HTTP | Purpose |
| --- | --- | --- | --- |
| Run bounded cycle(s) | `run` | none | Execute runtime cycles without hosting HTTP. |
| Supervise | `supervise` | n/a | Host runtime and HTTP surface in one process. With `--jsonl-events`, emit immediate supervisor startup evidence before entering a forever runtime. |
| Status | `status` | `GET /status` | Inspect latest run, counts, health, lock, control, attention, outcomes. |
| Health | `health` | `GET /health` | Stable loop health projection. |
| Events list | `events` | `GET /events` | Replay durable runtime events by cursor. |
| Events subscribe | n/a | `GET /events/stream` | Live SSE subscription with cursor and heartbeat. |
| Trigger admit | `trigger` | `POST /triggers` | Admit a generic trigger for a future cycle. |
| Trigger list | `triggers` | `GET /triggers` | Inspect pending/claimed/completed/failed/skipped triggers. |
| Pause | `pause` | `POST /control/pause` | Set generic loop control paused. |
| Resume | `resume` | `POST /control/resume` | Resume generic loop control. |
| Runs list | `list` | `GET /runs` | Inspect recent runs. |
| Run show | `show` | `GET /runs/:run_id` | Inspect a run and its steps. |

## Trigger Contract

A trigger is a durable reason for a future bounded Loop Run. It is not the Site decision and not itself authority for an emission.

Schema family:

```text
narada.site_operating_loop.trigger.v1
```

Lifecycle:

```text
pending -> claimed -> completed | failed | skipped
```

Each trigger result also carries lifecycle evidence under schema
`narada.site_operating_loop.trigger.lifecycle_state.v1`. The store refuses a
completion transition from `pending` and refuses any transition after a
terminal state. Existing trigger rows without lifecycle evidence are projected
from their stored `status` during schema repair/read.

Fields:

| Field | Meaning |
| --- | --- |
| `trigger_id` | Stable trigger id. |
| `loop_id` | Target loop. |
| `kind` | Trigger kind, such as `operator_request`, `webhook`, `timer`, `mailbox_arrival`. |
| `source` | Admitting surface or source family. |
| `source_ref` | Optional source event/request reference. |
| `payload` | Domain payload for Site-owned step interpretation. |
| `status` | Current trigger lifecycle state. |
| `run_id` | Run that consumed the trigger when available. |
| `result` | Generic completion summary. |

The runtime claims at most one pending trigger per active cycle. The Site loop module receives the trigger in `context.trigger` and decides what the trigger means.

## Runtime Events And Subscription

Runtime events are durable store records and SSE messages. They are not a transcript.
Host claim and lifecycle events are part of the same cursor-ordered evidence
stream, so an observer can distinguish authority acquisition, host serving,
bounded execution, and shutdown without inferring state from process output.

`narada-site-loop supervise --jsonl-events` also emits an immediate startup packet with schema `narada.site_operating_loop.supervisor_started.v1` after the HTTP attachment server is listening. That packet is service-wrapper evidence, not a durable runtime event.

Schema family:

```text
narada.site_operating_loop.runtime_event.v1
```

Minimum event kinds:

| Event | Meaning |
| --- | --- |
| `runtime_host_claimed` | A logical Site Operating Runtime Host authority was claimed or taken over; includes `runtime_id` and `authority_epoch`. |
| `runtime_host_lifecycle_transition` | The host moved between lifecycle states; includes the previous state and lifecycle history. |
| `runtime_started` | Runtime host started. |
| `cycle_started` | One runtime cycle began. |
| `cycle_completed` | One runtime cycle finished or skipped. |
| `runtime_stopped` | Runtime host stopped. |

`GET /events` returns bounded replay. `GET /events/stream` is a live SSE subscription by default. It accepts `after_event_id`, `limit`, `poll_ms`, and `heartbeat_ms`. It sends heartbeat comments while idle. `GET /events/stream?snapshot=1` returns a bounded SSE snapshot and closes.

The durable event cursor is ordered by occurrence time and row order, and every
event exposed to an observer has an `event_id`. Runtime host transitions are
persisted before they are projected to `onEvent`, so an attached surface never
receives an uncommitted lifecycle transition as if it were authoritative.

## Health And Control

Loop health is store-backed and derived from bounded run outcomes plus attention/backlog/outcome summaries. HTTP `/health`, CLI `health`, and status projections are read surfaces over the same store helpers.

Run evidence carries schema `narada.site_operating_loop.run.lifecycle_state.v1`
and follows `requested -> locking -> running -> completed`, with explicit
`locked`, `failed`, and `aborted` outcomes. Health evidence carries schema
`narada.site_operating_loop.health.lifecycle_state.v1` and retains transition
history across `unknown`, `healthy`, `degraded`, and `critical` outcomes. These
state records are stored beside the existing run and health projections; they
do not replace leases, step records, runtime events, or the read-only health
projection caused by attention/backlog signals.

Pause/resume is generic loop control. A paused runtime cycle records a paused cycle and does not call the Site loop module. Pause is not a Site policy decision; it is an operator/runtime control gate.

## Verification Expectations

A first-class Site Operating Loop runtime implementation must have tests proving:

- bounded run execution with Site-provided steps;
- failed Site step factories become durable failed run evidence;
- pause prevents Site step execution;
- generic trigger admission, claim, completion, and run linkage;
- runtime events are durable and cursor-readable;
- host lifecycle events expose stable event ids and preserve ordering across a
  bounded run;
- a second live host is refused while the first host lease is active, while an
  expired lease takeover retains the logical runtime id and increments the
  authority epoch;
- restart/failure cleanup leaves durable host lifecycle evidence rather than
  silently dropping the authority state;
- live SSE emits newly recorded events and sends heartbeat-compatible stream framing;
- CLI `run`, `serve`, `supervise`, status, health, events, triggers, pause/resume surfaces work against a store module;
- HTTP health/status/events/triggers/runs/control surfaces work against the same store;
- a Site-owned loop module fixture runs end to end through the generic `supervise` surface without moving domain logic into the generic runtime.

Current package-local proof lives under `packages/site-operating-loop/test/`.

## Non-Goals

The generic runtime must not:

- decide Site-specific domain policy;
- own source adapters such as mailbox, webhook, or task lifecycle readers;
- admit domain emissions such as directives, tasks, emails, or external writes;
- infer resident agent identity or carrier availability;
- replace NARS as the carrier runtime for agent sessions;
- treat trigger admission as proof that an emitted object was delivered or consumed.
