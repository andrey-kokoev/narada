# NARS Client Projection Contract

This document defines the target shape for NARS client projection semantics. It exists to prevent `agent-cli`, `agent-web-ui`, Cloudflare projection surfaces, and future clients from independently deciding what a NARS event means to an operator.

MCP-specific panel projection rules are defined in [`mcp-specific-operator-panels.md`](mcp-specific-operator-panels.md). SOP is the reference workflow implementation of that pattern; Synced Email is the reference read-only synced-record implementation.

## Objective

One shared projection contract must answer: given a NARS event, what client-visible class, row kind, label, summary, tone, identity, and view eligibility does it have?

Client surfaces render that projection in their own medium. They do not own event semantics.

## Authority Boundary

`@narada2/nars-client-projection-contract` owns:

- unwrapping NARS event envelopes such as `session_event.payload`;
- recognizing nested provider events;
- assigning event class: `conversation`, `operations`, `diagnostics`, or `raw`;
- assigning stable projection shape: `kind`, `label`, `tone`, `summary`, `event`, and semantic `renderKey` when available;
- deciding default view eligibility for conversation, operations, diagnostics, and raw projections;
- distinguishing canonical conversation facts from provider/runtime telemetry.

Client packages own only medium-specific rendering:

- `@narada2/agent-web-ui` owns DOM/Vue layout, markdown rendering, artifact iframe rendering, input controls, and browser state.
- `@narada2/carrier-terminal-projection` owns terminal formatting, colors, wrapping, and prompt behavior.
- `@narada2/cloudflare-nars-projection` owns Cloudflare registration, bridge publication, redaction, bounded caches, credentials, and transport policy enforcement.

Cloudflare may filter and redact, but it must filter by the shared projection class rather than by its own regex event classifier.

## Canonical Conversation Rule

Canonical conversation comes from NARS lifecycle events, not provider telemetry.

Canonical conversation events include:

- `user_message`;
- `operator_input_submitted` only as a local/pending echo until a durable `user_message` supersedes it;
- lifecycle `assistant_message` events emitted by NARS.

Provider events are not canonical conversation. This includes nested provider events shaped like:

```json
{
  "event": {
    "type": "item.completed",
    "item": {
      "type": "agent_message",
      "text": "..."
    }
  }
}
```

Those events may describe what the provider streamed or completed, but the operator-facing conversation row is the lifecycle `assistant_message` emitted by NARS.

## Event Classes

Projection class controls default visibility.

| Class | Meaning | Examples |
|---|---|---|
| `conversation` | Canonical operator/agent conversation facts | `user_message`, lifecycle `assistant_message`, artifact message parts carried by lifecycle assistant messages |
| `operations` | Operator-relevant runtime mechanics | tool calls/results, input queued/admitted/completed, turn start/complete/fail, artifact registration/read status |
| `diagnostics` | Runtime/provider/protocol observability | provider thread/turn/item telemetry, provider agent text telemetry, websocket attach, replay attach, routine health, protocol evidence |
| `raw` | Unknown or unclassified records | records not understood by the contract |

Provider `item.completed` with `item.type === "agent_message"` is `diagnostics`, not `conversation`.

Provider `item.started` or `item.completed` with `item.type === "mcp_tool_call"` is projected as `tool_call` or `tool_result` and classed as `operations`.

Provider `thread.started`, `turn.started`, and `turn.completed` are `diagnostics`.

## View Policies

Views are cumulative by operator usefulness, not by source transport.

- `conversation`: only canonical conversation facts. No provider telemetry, tool rows, health, protocol evidence, or stream fragments.
- `operations`: conversation plus operator-relevant runtime mechanics.
- `diagnostics`: operations plus provider/protocol/runtime observability.
- `raw`: all projected records, with state-sample inclusion controlled by an explicit option.

Routine healthy state samples should not pollute normal views. Degraded health and errors must remain visible in operations or diagnostics according to severity.

## Session Identity Projection

Client surfaces must display the session identity from NARS evidence, not from path guesses or surface launch arguments.

Identity sources, in priority order for display:

1. Current `session.health` or HTTP health payload fields: `site_id`, `agent_id`, `role`, `session_id`.
2. Durable NARS events: `session_started`, `session_health`, and lifecycle records carrying the same fields.
3. Startup hydration payloads such as `whoami.identity`, `whoami.role`, and checkpoint `site_id`.
4. A dotted `agent_id` display fallback, used only when no explicit `site_id` exists.

Cross-Site compatibility rule:

- Workspace-style Sites such as `D:/code/narada.sonar` and embedded authority roots such as `D:/code/narada.staccato/.narada` are both valid Site bindings.
- Client projections must not append `.narada`, trim `.narada`, or infer Site identity from path shape.
- When `site_id` is present, display should prefer `site_id.agent_id` or an equivalent prominent Site/agent split.
- When `site_id` is absent, a dotted `agent_id` such as `narada-staccato.resident` may be split for display only; it must not become discovery or attach authority.

## Runtime Projection Payloads

NARS exposes several operator-facing projection payloads. They are not chat messages and should not be rendered as conversation rows unless the shared event projection contract classifies them as conversation.

### Health And Status

`session.health` and the local HTTP health projection carry the current runtime status. Client surfaces may poll this payload and use it to hydrate header/status display.

Important fields:

| Field | Meaning |
|---|---|
| `status` | Runtime health state, for example `healthy` or an error/degraded state. |
| `site_id` | Explicit Site id when launch/runtime projected one. |
| `agent_id` | Bound agent identity. |
| `role` | Bound role when known. |
| `session_id` | NARS session id. Existing values may still be shaped as `carrier_...`. |
| `provider`, `model`, `thinking` | Intelligence provider/model/reasoning posture chosen before runtime execution. |
| `mcp` | Structured MCP fabric posture, including server list and fault counts. |
| `mcp_tools` | Optional tool catalog entries keyed by `server_name`. |

The health payload is the preferred source for status boxes, identity chips, intelligence provider display, and MCP inventory freshness. It is not the source of historical conversation.

### MCP Inventory

MCP inventory is a projection over the mounted Site fabric. Clients should normalize both health payloads and session events into the same shape:

```json
{
  "operational_state": "healthy",
  "server_count": 15,
  "startup_failure_count": 0,
  "runtime_fault_count": 0,
  "servers": [
    { "server_name": "narada-sonar-sop", "operational_state": "healthy", "tool_count": 18 }
  ],
  "tools": [
    { "server_name": "narada-sonar-sop", "tool_name": "sop_run_list", "description": "..." }
  ]
}
```

If health has server posture and events have tool names, clients may merge them by `server_name`. Missing tool names should be shown as unknown inventory, not as evidence that the MCP has no tools.

### Surface Affordances

Surface affordances describe how a mounted MCP surface wants to appear to an operator projection. They are declarative UI hints, not permission grants.

Shape:

```json
{
  "schema": "narada.mcp_surface.operator_affordance.v1",
  "surface_kind": "sop",
  "server_name": "narada-sonar-sop",
  "panel": {
    "kind": "sop",
    "title": "SOP",
    "sections": ["active_run", "templates", "recent_runs", "run_steps"]
  },
  "actions": {
    "read": ["refresh", "open_template", "open_run"],
    "run": ["start_run", "advance_run", "confirm_operator_step", "cancel_run"]
  },
  "tools": ["sop_template_list", "sop_run_list"]
}
```

Clients may use this to decide whether to show panels such as MCP, SOP, or Synced Email. Mutating actions still require a NARS protocol request and the relevant authority surface; the affordance object only says what the surface can represent.

### SOP Summary

When a SOP MCP surface is mounted, NARS may emit or answer a SOP summary projection:

```json
{
  "event": "session_sop_summary",
  "status": "ok",
  "server_name": "narada-sonar-sop",
  "affordance_contract": { "schema": "narada.nars.sop_operator_affordance_contract.v1" },
  "templates": { "count": 2, "items": [] },
  "runs": { "count": 3, "items": [] },
  "active_run": null,
  "recent_runs": { "count": 3, "items": [] },
  "doctor": null,
  "errors": []
}
```

Run items should expose display-safe fields such as `run_id`, `sop_id`, `title`, `status`, `started_at`, `updated_at`, `next_step`, `step_timeline`, and `available_actions`. `available_actions` means actions the projection can offer for this run shape; it is not final authority to mutate. Each action must still be admitted by NARS and the SOP MCP.

The SOP panel should render SOP templates and run state from SOP MCP data, not from the list of MCP tool names. Tool names only establish whether a SOP surface exists and which runtime actions can be represented.

### Synced Email Summary

When a read-only `mailbox-mcp` surface is mounted, NARS may emit or answer a synced mailbox summary projection:

```json
{
  "event": "session_mailbox_summary",
  "status": "ok",
  "server_name": "narada-sonar-mailbox",
  "affordance_contract": { "schema": "narada.nars.mailbox_operator_affordance_contract.v1" },
  "accounts": { "count": 1, "items": [] },
  "messages": { "count": 25, "items": [] },
  "unread": { "count": 4 },
  "doctor": null,
  "errors": []
}
```

Message items should expose display-safe fields such as `message_id`, `mailbox_id`, `folder`, `thread_id`, `subject`, `from`, `received_at`, `unread`, `importance`, `categories`, `preview`, and `attachment_count`. The synced email panel is read-only: mail send, draft, delete, or move actions belong to explicit Graph/mail authority surfaces, not to the mailbox projection.

### Scheduler Summary

When a scheduler MCP surface is mounted, NARS may emit or answer a scheduler summary projection:

```json
{
  "event": "session_scheduler_summary",
  "status": "ok",
  "server_name": "narada-sonar-scheduler",
  "affordance_contract": { "schema": "narada.nars.scheduler_operator_affordance_contract.v1" },
  "tasks": { "count": 2, "items": [] },
  "posture": { "total": 2, "ready": 1, "running": 0, "disabled": 1, "unknown": 0 },
  "errors": []
}
```

Task items should expose display-safe fields such as `task_name`, `title`, `status`, `schedule`, `next_run`, `last_run`, `last_result`, `command`, `history`, and `available_actions`. Scheduler mutating actions such as run, enable, disable, or delete are candidate actions only until NARS owns admitted protocol methods for them.

### Task Lifecycle Summary

When a task lifecycle MCP surface is mounted, NARS may emit or answer a workboard-oriented task summary projection:

```json
{
  "event": "session_task_lifecycle_summary",
  "status": "ok",
  "server_name": "narada-sonar-task-lifecycle",
  "agent_id": "resident",
  "affordance_contract": { "schema": "narada.nars.task_lifecycle_operator_affordance_contract.v1" },
  "recommendation": { "action": "continue", "reason": "active task claimed" },
  "counts": { "in_progress": 1, "pending_reviews": 2 },
  "in_progress": { "count": 1, "items": [] },
  "pending_reviews": { "count": 2, "items": [] },
  "obligations": { "count": 0, "items": [] },
  "errors": []
}
```

The task lifecycle panel is read-only by default. Task mutation tools such as claim, finish, close, and defer are projected as candidate actions until NARS owns explicit admitted protocol methods for those operations.

## Stream Semantics

Stream fragments and provider text telemetry are progress signals, not durable conversation rows.

A client may use stream/provider events to show activity such as "agent is responding". The final conversation message must come from the lifecycle `assistant_message` event.

String comparison must not decide which assistant message is real. Event kind and source decide. String-based duplicate detection is only a defensive idempotence guard.

## Artifact Semantics

Artifact references are conversation content only when carried inside canonical lifecycle `assistant_message` content/message parts.

Artifact registration, artifact read, and artifact projection status events are operations or diagnostics. They should not become chat messages by themselves.

## Render Identity

The shared contract should provide semantic `renderKey` values where event semantics are known:

- canonical assistant message: by turn or message identity when present;
- operator message: by request/input identity when present;
- tool call/result: by provider item or tool call identity when present;
- state/protocol records: by event sequence or explicit id.

Clients may add DOM ids or terminal state keys, but must not invent semantic identity that changes event class or canonicality.

## Cloudflare Projection Rule

Cloudflare projection must publish/filter based on shared projection class.

It must not classify records with ad hoc string/regex logic over `event.event`, because nested provider events have object-valued `event.event`. Under the target contract, the bridge asks the shared projection contract for class and only then applies Cloudflare projection policy and redaction.

Cloudflare owns redaction and credential policy. It does not own the meaning of `assistant_message`, provider telemetry, or tool events.

## Migration Arrows

1. Expand `@narada2/nars-client-projection-contract` to classify nested provider events and expose a stable projection/classification API.
2. Add contract tests for provider agent messages, provider tool events, lifecycle assistant messages, envelope unwrapping, and view eligibility.
3. Make `@narada2/cloudflare-nars-projection` consume the shared classifier instead of local regex classification.
4. Remove `agent-web-ui` promotion of provider `agent_message` events into `assistant_message` conversation rows.
5. Reduce `agent-web-ui` lifecycle/provider string suppression to defensive duplicate guards only.
6. Update tests that currently encode provider assistant rows as conversation rows.
7. Add cross-surface parity tests for a realistic NARS turn: operator input, provider intro, tool events, provider final, and lifecycle aggregate.
8. Run focused contract, Cloudflare projection, and web UI tests before broader validation.

## Acceptance Criteria

A realistic NARS startup turn must produce the same conversation facts on local `agent-web-ui` and Cloudflare projection:

- one operator message;
- one lifecycle assistant message;
- no provider `agent_message` rows in conversation view;
- tool calls/results visible in operations;
- provider text telemetry visible only in diagnostics/raw;
- artifact references render in conversation only when carried by lifecycle assistant message parts.

The same event list must be classified by the same shared code path for local web, terminal eligibility, and Cloudflare projection filtering.
