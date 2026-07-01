# NARS Client Projection Contract

This document defines the target shape for NARS client projection semantics. It exists to prevent `agent-cli`, `agent-web-ui`, Cloudflare projection surfaces, and future clients from independently deciding what a NARS event means to an operator.

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
