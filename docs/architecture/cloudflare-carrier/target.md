# Cloudflare Carrier Target

This document defines the target posture for a Narada carrier hosted on Cloudflare.

The Cloudflare carrier is not a new carrier semantics family because it runs on Cloudflare. It is a carrier implementation whose host posture is Cloudflare while preserving the shared carrier runtime contract.

Use [`Carrier Runtime Contract`](../carrier-runtime-contract.md) for runtime semantics and [`Carrier Taxonomy`](../../concepts/carrier-taxonomy.md) for the vocabulary boundary between carrier kind, host, transport, protocol, runtime contract, surface, and control channel.

## Definition

A **Cloudflare Carrier** is a Narada carrier implementation that runs one bounded Carrier Session on Cloudflare infrastructure and emits reconstructable session evidence while obeying the shared carrier runtime contract.

It must preserve the same meanings for:

- carrier input events;
- control requests;
- observer visibility, mute, admission, suppression, and evidence;
- carrier command vocabulary and command effects;
- carrier host command admission and terminal evidence;
- carrier session goals;
- provider dispatch decisions;
- turn terminal states;
- payload refs and reader-tool semantics;
- session identity and closeout evidence.

Cloudflare changes the host, durability, concurrency, transport, storage, and deployment mechanics. It must not redefine admission, authority, command meaning, observer semantics, provider-turn classification, or session evidence.

## Target Shape

`site.read` exposes a `site_product_status` derived from durable site facts: site status, operations, memberships, sessions, tasks, carrier evidence, authority events, and site continuity status. It is a site-level read model for the operator's product surface; it does not create a second authority path or collapse site authority, continuity, and task work into one mutation channel. Its `next_action` is a navigation/work queue hint over existing facts.

`site.list` exposes the same status vocabulary across visible sites as `site_product_statuses`, plus a `site_product_overview` aggregate. This is the multi-site operator index: it should show which site needs attention next without changing the underlying site, operation, continuity, or task authority boundaries.

`site.list` also exposes `site_posture_route`. This is the worker-published route summary for the current multi-site focus: `domain`, `command_state`, `command_action`, `next_action`, `target`, `status`, and `reason`. It exists so operator clients can follow the same loop guard without reimplementing it. It does not execute focus changes by itself and does not grant site mutation authority.

`operation.read` exposes an `operation_lifecycle_status` derived from existing durable operation facts: operation status, sessions, tasks, carrier evidence, site continuity status, resident loop/dispatch records, and directive delivery state. It is a read-model summary, not a new authority path; it gives operators one lifecycle health signal while preserving the underlying evidence rows and authority classifications.

`operation.read` exposes `operation_posture_overview` and `operation_posture_route` for the visible operation set. The overview summarizes readiness, action, reason, and command-state counts. The route summarizes whether the next operator action should monitor operations or focus a different operation. The same route is mirrored inside `operation_product_surface` so non-console clients can consume one product surface without duplicating console code.

`operation.read` exposes `site_file_change_proposals` and `operation_product_surface.site_file_change_proposal_count` as a Cloudflare-recorded proposal evidence surface. This is not filesystem mutation authority. The proposal surface records intended site-file changes with `filesystem_executor_authority = windows_filesystem_executor`, `filesystem_mutation_admission = not_admitted`, and `repository_publication_admission = not_admitted` until separate governed contracts admit those effects.

`operation.read` also exposes `site_file_materializations` and `operation_product_surface.site_file_materialization_count` as the first Cloudflare-owned site-file materialization record. This is not Windows filesystem mutation and not repository publication. The materialization surface may admit only a Cloudflare site-file-store record with explicit cutover evidence, `filesystem_executor_authority = cloudflare_site_file_store`, `windows_filesystem_mutation_admission = not_admitted`, and `repository_publication_admission = not_admitted`.

The control room maps lifecycle `next_action` values to existing operator actions: start or focus a session, refresh operation evidence, inspect continuity workflow, focus open task work, or inspect directive delivery. These are navigation/workflow affordances over existing product state, not hidden mutation shortcuts.

```json
{
  "carrier_kind": "cloudflare-carrier",
  "carrier_host": "cloudflare-durable-object",
  "carrier_surface": "web-console",
  "carrier_transport": "websocket",
  "carrier_protocol": "narada.carrier.v1",
  "carrier_runtime_contract": "narada.carrier.runtime.v1"
}
```

This shape is illustrative, not exclusive. A production topology may combine Workers, Durable Objects, Queues, Workflows, HTTP, SSE, and WebSockets. Those are host and transport choices unless they change runtime semantics.

## Layer Ownership

| Layer | Cloudflare Carrier target |
| --- | --- |
| `CarrierKind` | `cloudflare-carrier`, the semantic implementation family. |
| `CarrierHost` | Cloudflare Worker, Durable Object, container, Workflow, or combined posture. |
| `CarrierTransport` | HTTP, WebSocket, SSE, Queue, Durable Object fetch, or another governed transport. |
| `CarrierProtocol` | Shared Narada carrier protocol frames and session events. |
| `CarrierRuntimeContract` | Shared input, command, observer, provider, payload, goal, and terminal-state semantics. |
| `CarrierSurface` | Web console, API client, operator dashboard, or no direct surface. |
| `ControlChannel` | Concrete request/result path into or out of the carrier. |

## Runtime Obligations

The Cloudflare carrier must:

1. Bind exactly one durable Agent identity into one bounded Carrier Session.
2. Materialize session start, input, turn, provider, command, observer, host-command, interruption, completion, failure, and closeout evidence.
3. Normalize all incoming transport records into shared carrier input/control shapes before runtime admission.
4. Use shared carrier input semantics for queueing, turn creation, observer suppression, provider dispatch, and completion posture.
5. Preserve observer labels and suppression evidence; no hidden observer injection.
6. Preserve carrier command effects for status, tools, observers, observer mute/unmute, queue, model/thinking where supported, and goal lifecycle.
7. Treat carrier host command execution as an admitted host crossing with request, admission, start, completion, failure, or rejection evidence.
8. Keep provider dispatch and provider output evidence distinct from transport delivery.
9. Store evidence durably enough to reconstruct the session after Worker eviction, Durable Object restart, or client disconnect.
10. Expose current runtime status without implying mutation authority.

## Host Topology

The default target topology is:

```text
Operator/Web/API client
-> Worker transport edge
-> Durable Object carrier session
-> provider adapter / external effect boundary
-> durable evidence store
```

The Durable Object is the natural session coordinator because it can serialize session-local state for one carrier session. A Worker may terminate TLS, authenticate requests, route to the Durable Object, and serve static or web-console surfaces.

Queues or Workflows may assist with long-running or retryable work, but they must not become parallel carrier authorities. Their outputs cross back into the carrier as evidence-bearing results.

The Worker should be stateless with respect to carrier session truth. It may authenticate, authorize, route, upgrade WebSockets, validate envelope shape, and reject malformed requests before routing. It must not independently mutate carrier session state.

The Durable Object should own the per-session serial lane:

```text
carrier_session_id
-> Durable Object id/name
-> ordered control/input admission
-> session event append
-> status/read projection
```

The session event store may live inside Durable Object storage for the first slice. A later production topology may project or archive events into D1, R2, or another append/read substrate, but the Durable Object remains responsible for the ordered session mutation lane unless a new carrier host contract replaces it.

## Session Routing

Carrier sessions must be routed by durable carrier identity, not by transient client connection.

Required routing inputs:

- `carrier_session_id`;
- `agent_id`;
- `site_id` or site ref;
- authenticated operator or control principal;
- protocol version.

The Worker resolves the target Durable Object from `carrier_session_id`. If no session exists, creation must require a session start request with enough identity evidence to bind exactly one Agent to exactly one bounded Carrier Session.

Client reconnects, parallel tabs, HTTP retries, and WebSocket reconnects must route to the same Durable Object and preserve the same ordered session evidence stream.

## State Model

The carrier session needs durable state for:

- carrier session id, agent id, site id, and site root or site ref;
- session goal and goal state;
- observer mute state;
- pending input queue;
- active turn state;
- provider dispatch state;
- tool/host-command execution state;
- monotonic session event sequence;
- payload refs and storage locations;
- closeout state.

Durable state is operational state. Session events remain the reconstructable evidence stream.

Operational state may be compacted or rebuilt from events. If the compacted state and event stream disagree, the event stream is the stronger reconstruction source unless a later migration record explicitly supersedes it.

The first slice should keep state intentionally small:

```json
{
  "carrier_session_id": "carrier_session_...",
  "agent_id": "narada.agent",
  "site_id": "site_...",
  "protocol_version": "narada.carrier.v1",
  "next_event_sequence": 1,
  "goal": {
    "text": null,
    "state": "unset"
  },
  "observer_interjections_muted": false,
  "queue": [],
  "active_turn": null,
  "closed": false
}
```

This is not a final storage schema. It is the minimum state needed to prove ordered input admission and reconstructable evidence.

## Transport Model

Transport is not admission.

Every inbound request must first become one of:

- carrier control request;
- carrier input event;
- carrier command;
- host command request;
- provider/tool result callback;
- status/read request.

The carrier then applies shared classification and admission rules. WebSocket, HTTP, SSE, Queue, and Durable Object fetch differ only in delivery mechanics unless the runtime contract explicitly says otherwise.

## Control API Target

The first HTTP/WebSocket control surface should be narrow and protocol-shaped:

| Operation | Meaning |
| --- | --- |
| `session.start` | Create or bind a Cloudflare Carrier Session. |
| `session.status` | Read carrier status and compact runtime state. |
| `carrier.input.deliver` | Deliver a normalized or normalizable carrier input event. |
| `carrier.command.execute` | Execute a carrier command such as goal, observers, or queue. |
| `carrier.interrupt` | Request interruption of an active turn. |
| `session.events.read` | Read ordered session events by sequence/cursor. |
| `session.close` | Close the bounded carrier session with closeout evidence. |

The public API may use HTTP routes, WebSocket messages, or both. The semantic operation names above are the contract-facing shape; route names are transport mechanics.

Every mutating operation must be idempotency-aware. A request should carry a request id or event id that lets the Durable Object avoid duplicate evidence when clients retry after disconnects.

## Concurrency Model

One Carrier Session has one ordered mutation lane.

Within that lane:

- input admission is serialized;
- carrier commands that mutate runtime state are serialized;
- status and event reads may run concurrently if they do not mutate state;
- active-turn provider work may be represented as pending state, but its terminal callback must re-enter the ordered lane before changing session truth;
- queue draining must not race observer mute, goal lifecycle, interrupt, or closeout commands.

Cloudflare's concurrency model is a host detail. The carrier contract sees deterministic session order.

## Evidence Model

The Cloudflare carrier must emit the same session event vocabulary used by local carriers. At minimum, it must cover:

- input queued/admitted/completed;
- system directive held/released;
- observer observation/proposal/admission/suppression;
- carrier command executed;
- carrier host command requested/admitted/rejected/started/completed/failed;
- turn started/completed/interrupted/failed;
- provider request/output/tool-call evidence;
- payload ref evidence when payloads are too large or sensitive to inline.

Evidence ordering must be deterministic within one Carrier Session.

Each session event needs a monotonic sequence or equivalent cursor in addition to event id and timestamp. Timestamps are useful evidence; they are not sufficient ordering authority under retries, reconnects, or distributed callbacks.

For the first slice, the event append rule should be:

```text
read next_event_sequence
-> construct session event
-> append event
-> increment next_event_sequence
-> update compact state
```

If storage APIs require separate writes, recovery must detect and repair incomplete writes by replaying or marking a carrier diagnostic event. Silent loss is not acceptable.

`operation.read` must expose recovery posture as a boundary-aware read model. The posture may report session snapshot reload and carrier evidence replay separately, but it must also enumerate recoverable durable boundaries derived from persistence posture, including the site registry, carrier evidence index, task lifecycle store, and Cloudflare site-file materialization store. This does not mean every boundary is replayed through carrier evidence; it means the operator can see which declared durable stores are available for recovery and which boundary is the next repair target.

## Provider Posture

Provider execution is a separate target slice from carrier admission.

The Cloudflare carrier may initially support one of these provider postures:

| Posture | Meaning |
| --- | --- |
| `refused` | Provider dispatch is intentionally unavailable and records terminal refusal evidence. |
| `fixture` | Provider dispatch uses deterministic fixture output for contract tests. |
| `remote-provider-api` | Provider dispatch calls an external provider API directly from Cloudflare. |
| `external-worker-callback` | Provider dispatch starts external work and accepts a governed callback result. |
| `cloudflare-workers-ai` | Provider dispatch calls Cloudflare Workers AI through an explicit adapter, records provider request/output evidence, and may feed carrier-owned tool result evidence into a follow-up provider turn. |

The first implementation may use `refused`, `fixture`, or `cloudflare-workers-ai`, but a missing provider adapter must be a recorded refusal, not a hanging turn and not silent completion. Workers AI tool use is limited to tools advertised by the carrier and still requires the carrier-owned tool/effect boundary to admit, deny, or fail the result.

Provider output streaming over WebSocket or SSE is presentation. Provider evidence is session truth only after the carrier records provider request/output/turn events.

## Tool / Effect Boundary

Provider tool-call output is not effect execution.

When a provider emits a structured tool request, the Cloudflare carrier must record:

- `provider_tool_call_requested` for the provider-originated request;
- `tool_call_requested` for the carrier-side effect boundary crossing;
- `tool_result_received` for the admitted, denied, or failed effect result, including structured `admission_action` and `admission_reason` evidence when the boundary admits or denies the effect. An admitted result must also identify the capability, effect scope, and principal authority that made `ok` admissible.

If provider execution continues after a tool result, the carrier must feed the result back as evidence, not as an implicit effect. The first Cloudflare implementation supports bounded follow-up provider turns after tool-call batches, capped by an explicit iteration limit so provider/tool recursion cannot run unbounded.

The default Cloudflare posture is deny-by-default: if no tool/effect adapter is configured, the carrier records a denied `tool_result_received` with a stable unconfigured reason. A model response must not be able to create an effect path merely by naming a tool.

Configured tool/effect adapters must expose their posture in `session.status`:

- `tool_effect_posture`;
- `tool_effect_adapter_kind`;
- `tool_effect_supported_tools`;
- `tool_effect_capabilities`.

The first configured Cloudflare tool/effect adapters admit only explicitly enabled capabilities. Runtime metadata reads may admit `cloudflare_carrier_runtime_metadata_read` when enabled. KV reads may admit `cloudflare_carrier_kv_get` only when enabled and backed by a KV binding. KV writes may admit `cloudflare_carrier_kv_put` only when separately enabled, backed by a KV binding with `put()`, and authorized by the requesting principal. Unsupported tool names must be denied with result evidence. Principals without matching authority must be denied with `tool_effect_authority_denied`. Admitted effects carry `capability_ref`, `effect_scope`, and `authority_ref` evidence. This proves the crossing without granting repository, network, shell, or credential effects.

Future effect adapters need a narrower authority record for their substrate before they can return `ok`. Status posture and session events are evidence of the boundary crossing; they are not capability grants.

## Host Command Posture

Cloudflare does not have a local shell equivalent.

Carrier host commands in a Cloudflare carrier should start as a narrow command family with explicit target categories:

- diagnostic read commands against carrier runtime state;
- deployment/runtime metadata reads;
- approved maintenance actions;
- external effect requests mediated by a specific capability adapter.

Every host command must emit request and admission evidence. Unsupported host commands must emit rejection evidence with a stable reason. No command should fall through to arbitrary platform execution.

## Authority Boundary

Cloudflare hosting does not grant authority.

The carrier may enforce policy and mediate effects, but durable mutation authority remains with the declared Site, task lifecycle, inbox/outbox, repository publication, credential, or external substrate authority.

Cloudflare may record a task-lifecycle shadow read from a local Windows Site, but that read is projection evidence only. The record must preserve `mutation_authority = windows_task_lifecycle_sqlite` and `cloudflare_write_admission = not_admitted`; it must not create a Cloudflare task write path or imply task lifecycle authority migration.

Cloudflare may also record task-lifecycle write-admission decisions for proposed mutation classes. By default, task lifecycle writes remain refused while Windows remains the mutation authority. `shadow_read_record` may be admitted only as a non-mutating projection record with `write_effect = none`. The admitted Cloudflare task lifecycle cutovers are explicit per mutation class: `task_create`, `task_claim`, `task_report`, `changed_file_evidence`, `task_finish`, `task_projection_write`, `task_source_state_write`, `task_assignment_write`, `task_role_resolution_write`, and `task_roster_mutation_write` each require their own cutover flag and evidence refs.

The first task lifecycle mutation class eligible for Cloudflare cutover is `task_create`. It may be admitted only when the request carries explicit cutover evidence: `cloudflare_task_create_cutover = true`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. An admitted create writes to the distinct Cloudflare task lifecycle D1 substrate with `mutation_authority = cloudflare_task_lifecycle_d1`, `cloudflare_write_admission = admitted`, and `write_effect = task_lifecycle_create`.

The second eligible mutation class is `task_claim`, but only for tasks that already exist in the Cloudflare task lifecycle D1 substrate. It may be admitted only when the request carries `cloudflare_task_claim_cutover = true`, `task_id`, claimant identity, `assignment_authority_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. The claim transition is opened-only: it records `conflict_policy = opened_only_no_overwrite`, changes the task status from `opened` to `claimed`, records claimant and assignment authority evidence, and returns conflict evidence instead of overwriting an already claimed task. This does not migrate Windows roster or role-resolution authority.

The third eligible mutation class is `task_report`, but only for Cloudflare task lifecycle rows already claimed under the Cloudflare claim cutover. It may be admitted only when the request carries `cloudflare_task_report_cutover = true`, `task_id`, reporter identity, `summary`, `report_authority_ref`, `report_schema_ref`, `changed_file_evidence_boundary_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. The reporter must match the claimant when a claimant agent is recorded. An admitted report records report summary, verification, report authority, schema evidence, previous status, resulting status, and rollback posture; it may move the Cloudflare task row from `claimed` to `closed` or `needs_continuation`. Changed files may be recorded as report metadata, but that metadata is not filesystem evidence until `changed_file_evidence` is admitted separately.

The fourth eligible mutation class is `changed_file_evidence`, but only for Cloudflare task lifecycle rows that already have a matching Cloudflare report. It may be admitted only when the request carries `cloudflare_changed_file_evidence_cutover = true`, `task_id`, `report_id`, file path identity, reporter identity, `file_evidence_authority_ref`, material source evidence, repository or site-file authority evidence, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. An admitted record appends changed-file evidence to the Cloudflare task row with `write_effect = changed_file_evidence_record`; it explicitly keeps filesystem mutation, repository publication, and projection write admission as `not_admitted`.

The fifth eligible mutation class is `task_finish`, but only for Cloudflare task lifecycle rows that already have a Cloudflare report and are in `closed` status. It may be admitted only when the request carries `cloudflare_task_finish_cutover = true`, `task_id`, finalizer identity, `finish_verdict`, `finish_authority_ref`, `finish_schema_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. The current finish cutover accepts the `accepted` verdict, records finish authority/schema evidence and rollback posture, and moves the Cloudflare task row from `closed` to `finished` without taking over projection writes, filesystem mutation, repository publication, or SQLite source authority.

The sixth eligible mutation class is `task_projection_write`, but only as a Cloudflare read-model/projection record for an existing Cloudflare task lifecycle row. It may be admitted only when the request carries `cloudflare_task_projection_write_cutover = true`, `task_id`, `projection_target_ref`, `projection_schema_ref`, `projection_authority_ref`, `source_evidence_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. An admitted projection write records projection target, schema, authority, source evidence, task status, and confirmation evidence with `write_effect = task_lifecycle_projection_write`; it explicitly keeps SQLite source mutation, filesystem mutation, and repository publication as `not_admitted`.

The seventh eligible mutation class is `task_source_state_write`, but only for existing Cloudflare task lifecycle rows. It may be admitted only when the request carries `cloudflare_task_source_state_write_cutover = true`, `task_id`, `source_state_authority_ref`, `source_state_schema_ref`, `source_state_evidence_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. An admitted source-state write records that Cloudflare D1 is the canonical source-state authority for that Cloudflare task lifecycle row with `write_effect = task_lifecycle_source_state_write`; it explicitly keeps Windows SQLite source writes, mailbox mutation, assignment authority, role resolution, filesystem mutation, and repository publication as `not_admitted` for this operation.

The eighth eligible mutation class is `task_assignment_write`, but only for existing Cloudflare task lifecycle rows. It may be admitted only when the request carries `cloudflare_task_assignment_write_cutover = true`, `task_id`, assignee identity, `assignment_authority_ref`, `assignment_schema_ref`, `assignment_evidence_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. An admitted assignment write records Cloudflare D1 assignment authority for that Cloudflare task lifecycle row with `write_effect = task_lifecycle_assignment_write`; it explicitly keeps roster mutation, role resolution, mailbox mutation, filesystem mutation, and repository publication as `not_admitted` for this operation.

The ninth eligible mutation class is `task_role_resolution_write`, but only for existing Cloudflare task lifecycle rows that already have an admitted Cloudflare assignment write. It may be admitted only when the request carries `cloudflare_task_role_resolution_write_cutover = true`, `task_id`, `assignee_principal_id`, `role_resolution_authority_ref`, `roster_source_ref`, `role_resolution_schema_ref`, `role_resolution_evidence_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. An admitted role-resolution write resolves the assignee through Cloudflare site membership, records role-resolution authority and roster-read admission for that Cloudflare task lifecycle row, and explicitly keeps roster mutation, mailbox mutation, filesystem mutation, and repository publication as `not_admitted`.

The tenth eligible mutation class is `task_roster_mutation_write`, but only for existing Cloudflare task lifecycle rows that already have an admitted role-resolution write. It may be admitted only when the request carries `cloudflare_task_roster_mutation_write_cutover = true`, `task_id`, `assignee_principal_id`, `roster_mutation_authority_ref`, `roster_schema_ref`, `roster_evidence_ref`, `membership_role`, `membership_status`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. An admitted roster mutation write records the roster mutation against the Cloudflare task lifecycle row and upserts the assignee's Cloudflare site membership row; it explicitly keeps mailbox mutation, filesystem mutation, and repository publication as `not_admitted`.

This is a split-by-mutation-class posture, not a full task lifecycle migration: after `task_roster_mutation_write`, Cloudflare owns create, claim, report, changed-file evidence record, finish, projection-write, source-state, assignment-write, role-resolution, and roster-mutation authority for Cloudflare task lifecycle rows, but mailbox behavior, filesystem mutation, and repository publication remain refused or Windows-owned until their own cutover contracts and evidence exist. A mailbox status shadow-read may be Cloudflare-recorded as observation evidence only when `mailbox_send_admission` and `mailbox_mutation_admission` remain `not_admitted`; this records status visibility without moving Microsoft Graph, draft, reply, ticket, or send authority. Read models must expose the authority partition, for example `task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_cloudflare_remaining_windows_effects` for task lifecycle and `mailbox_status_shadow_read_cloudflare_recorded_send_and_mutation_windows_owned` for mailbox status shadow-read, alongside explicit retained Windows authority for non-migrated effects. Bounded task-lifecycle reads may accept `task_lifecycle_include_task_ids` to append named task rows to the bounded list without changing the default list order or treating omitted rows as missing evidence.

The first eligible site-file mutation class is `site_file_materialization`, but only as a Cloudflare site-file-store materialization record. It may be admitted only when the request carries `cloudflare_site_file_materialization_cutover = true`, a proposal id or proposal ref, file path, content SHA-256, `materialization_authority_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. An admitted materialization records `write_effect = cloudflare_site_file_materialization_record`; it explicitly keeps Windows filesystem mutation and repository publication as `not_admitted`.

The source-state boundary is intentionally separate from projection writes. A `task_source_state_write` admission may become admissible only with `cloudflare_task_source_state_write_cutover = true`, task identity, source-state authority/schema/evidence refs, cutover point, governed write contract, and confirmation evidence. The source-state effect route records canonical Cloudflare D1 source-state authority for Cloudflare task lifecycle rows only; it keeps mailbox mutation, assignment authority, role resolution, filesystem mutation, repository publication, and local resident mechanics outside Cloudflare authority until their own cutover contracts exist. Assignment and role resolution then become admissible only through their own later cutover contracts.

The existing Cloudflare carrier task workbench is not the task lifecycle authority. It remains a separate local product surface for carrier task effects. Migrated task lifecycle writes use their own task lifecycle table, schema, operation names, and authority vocabulary so task lifecycle authority is not smeared into generic carrier tasks.

Cloudflare secrets and bindings are host capabilities. They are not carrier permissions by themselves. Any effectful use must cross the appropriate carrier admission boundary and emit evidence.

## Synchronized Site Embodiments

A Cloudflare carrier may be one embodiment of a Narada Site that is also embodied locally, such as through a Windows CLI, TUI, daemon, filesystem tree, or repository clone. This is allowed only when synchronization is treated as projection or transport, not as authority.

The target shape is synchronized Site embodiments with explicit mutation authority routing:

```text
local Windows embodiment
cloudflare embodiment
other carrier or dashboard embodiments
-> mutation class
-> declared authority locus
-> admitted mutation
-> evidence and confirmation
```

Multiple embodiments may inspect, present, propose, forward, cache, or rebuild projections for the same Site. They must not independently admit the same durable mutation merely because they can reach a local store, Worker binding, API route, or synchronized file tree.

Each mutation class needs one declared authority locus before execution. A first production topology may split authority by mutation class, for example:

| Mutation class | Possible authority locus | Cloudflare posture |
| --- | --- | --- |
| Hosted carrier session events | Cloudflare Durable Object or event store for that carrier session | Admit and append session evidence. |
| Hosted Site membership | Governed Site registry for the hosted Site | Admit membership changes through authenticated operator authority. |
| Local repository or filesystem mutation | Local Site authority on the operator machine | Refuse locally or forward through a governed local ingress. |
| Task or artifact mutation | Declared task/artifact authority for the Site | Admit only when that authority is Cloudflare; otherwise forward or refuse. |
| Read models and dashboards | Derived projection store | Rebuild or display only; no mutation authority. |

Authority may migrate between local and Cloudflare embodiments only through an explicit migration operation that records source authority, target authority, mutation classes affected, cutoff point, and confirmation evidence. A temporary dual-write or sync period is not authority migration unless one locus remains the sole admission authority for each mutation class.

If a Cloudflare console, local Windows command, or other embodiment cannot resolve the authority locus for a mutating request, it must refuse or run in proposal/inspection mode. It must not silently choose the current embodiment as authority.

## Security and Binding

The carrier must authenticate control callers before routing mutating requests. Authentication proves caller identity; it does not by itself prove authority for a requested carrier effect.

The target security posture is:

- Worker authenticates the caller and records principal evidence in the request envelope.
- Durable Object applies carrier/session policy and runtime admission.
- Effect adapters validate the narrower authority needed for their substrate.
- Secrets remain Cloudflare bindings or external secret references; they are never serialized into session events.

Session events may record that a credential class or binding was configured, used, refused, or missing. They must not record secret values.

## Versioning

Cloudflare carrier deployments must name the shared protocol and runtime contract versions they implement.

At minimum, status should expose:

- carrier implementation version;
- carrier protocol version;
- carrier runtime contract version;
- command contract version;
- provider adapter posture;
- schema/fixture compatibility level.

If a deployment receives a request for an unsupported protocol version, it must reject the request with diagnostic evidence rather than best-effort reinterpretation.

## Non-Goals

This target does not require `agent-cli` or `agent-tui` to run inside Cloudflare.

This target does not make Cloudflare Workers, Durable Objects, Queues, or Workflows carrier semantics.

This target does not define final storage schema, provider adapter implementation, authentication, deployment, or web-console UX.

This target does not grant native host command execution by default. Host commands on Cloudflare require a specific admitted execution posture because the host is not a local shell.

This target does not require provider streaming in the first slice.

This target does not require multi-agent orchestration inside one Durable Object. One Cloudflare carrier session still embodies one durable Agent.

## Open Design Questions

1. Which Cloudflare primitive owns the authoritative session event sequence: Durable Object storage, D1, R2 append objects, or a hybrid?
2. How are payload refs stored and read: R2, D1, Durable Object storage, or signed external storage?
3. Which provider execution paths are admissible from Cloudflare, and which require an external worker or callback?
4. How should long-running turns survive Worker request limits, provider stream interruptions, or client disconnects?
5. What authentication and operator-surface binding evidence is required before accepting control requests?
6. How are Cloudflare deployments versioned against shared carrier protocol/contract versions?
7. Which host-command categories exist on Cloudflare, given there is no local shell equivalent?
8. What is the migration path from local carrier session evidence to Cloudflare-hosted carrier evidence?
9. Which event storage substrate gives the best balance of ordered append, cursor reads, export, and replay?
10. Should WebSocket connections receive live event projection from the Durable Object directly or through a separate broadcast surface?
11. How should turn cancellation map to provider APIs that do not support cancellation?
12. What retention, compaction, and export policy is required for carrier session evidence?

## First Implementation Slice

The first slice should prove the contract before optimizing topology:

1. Create one Durable Object per Carrier Session.
2. Accept carrier control/input events over HTTP or WebSocket.
3. Normalize inbound records into shared carrier protocol shapes.
4. Persist session events with monotonic sequence ids.
5. Implement status, observer mute/unmute, observer input admission, goal show/set/pause/resume/clear, and queue semantics.
6. Represent provider execution as an explicit refused or fixture provider adapter, not as silent no-op behavior.
7. Add fixture tests proving Cloudflare carrier output event kinds match shared carrier input pipeline expectations.

The first successful result is not a full web agent. It is a Cloudflare-hosted carrier session that preserves Narada carrier meaning under a different host posture.

## Acceptance Gates

The target is not satisfied by deploying a Worker that can chat with a model. The first slice is acceptable only when these gates pass:

1. A session start request creates one durable carrier session with stable `carrier_session_id`, `agent_id`, and protocol version evidence.
2. Replayed or retried input delivery does not duplicate session events.
3. Observer fixture cases produce the same event-kind sequence as the shared carrier input pipeline fixtures.
4. Goal command fixture cases prove show, set, pause, resume, and clear behavior.
5. Unsupported host commands produce rejection evidence.
6. Provider-unavailable posture produces terminal refusal/failure evidence.
7. Session status can be reconstructed after Durable Object restart or equivalent test reset.
8. Event reads return ordered events by sequence/cursor.
9. Secrets are not present in emitted evidence.
10. Provider-emitted tool calls cross a carrier-owned tool/effect boundary and record provider request, carrier request, result evidence, and follow-up provider evidence when tool results are returned to the provider. Result evidence must distinguish denied effects from admitted effects whose execution later failed.
11. The default tool/effect posture is deny-by-default and visible in `session.status`.
12. Configured Cloudflare tool/effect adapters advertise their supported tool list and admit only explicitly enabled capabilities such as `cloudflare_carrier_runtime_metadata_read`, `cloudflare_carrier_kv_get`, and `cloudflare_carrier_kv_put`.
13. Tests run without a live provider dependency unless an explicit provider integration profile is selected.

## Deferred Work

These are intentionally outside the first slice:

- full web-console UX;
- production provider streaming;
- multi-session dashboards;
- cross-session scheduling;
- autonomous repair or retry orchestration;
- arbitrary shell-like host execution;
- long-term evidence warehousing;
- local-to-Cloudflare session migration tooling.

Deferred does not mean optional. It means these concerns should not distort the first proof of carrier contract preservation.
