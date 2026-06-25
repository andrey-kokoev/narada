# Carrier Taxonomy

Narada uses **carrier** words for several related layers. Keep them separate so NARS-backed local sessions, TUI/client surfaces, Codex-as-carrier, and future Cloudflare carriers can share runtime semantics without sharing presentation or deployment mechanics.

## Layer Model

```text
Carrier Surface
-> Carrier Transport
-> Carrier Protocol
-> Carrier
-> Carrier Runtime Contract
-> Carrier Host
```

The order above is explanatory, not a call stack. A carrier may bundle several layers in one process, but the meanings remain distinct.

## Terms

| Term | Owns | Does not own |
| --- | --- | --- |
| `Carrier` | Runs one bounded carrier session according to Narada rules: input admission, turn boundaries, interruption, provider dispatch, session evidence, closeout, and status. | UI layout, transport mechanics, deployment substrate, durable Agent authority. |
| `CarrierKind` | The semantic implementation family whose behavior contract is being claimed, such as `narada-agent-runtime-server`, `agent-tui`, `codex-as-carrier`, or `cloudflare-carrier`. | Whether the carrier is local, remote, terminal, web, Worker, Durable Object, container-hosted, or projected through `agent-cli`. |
| `CarrierHost` | The execution environment where carrier state and code live, such as `local-process`, `cloudflare-worker`, `cloudflare-durable-object`, or `container`. | Carrier semantics or protocol meaning. |
| `CarrierTransport` | The IO mechanism crossing the carrier boundary, such as `interactive-terminal`, `jsonl-stdio`, `control-jsonl`, `websocket`, `sse`, or `http`. | Admission, authority, turn creation, or transcript meaning. |
| `CarrierProtocol` | Canonical message shapes and event vocabulary: input events, control records, session events, payload refs, command effects, terminal states, observer metadata. | Carrier-specific rendering, process launch, or storage backend selection. |
| `CarrierRuntimeContract` | Runtime law all compatible carriers must obey: what inputs mean, what evidence is emitted, when provider turns exist, how commands and observer visibility are classified. | A specific UI, host, or provider adapter. |
| `CarrierSurface` | User-facing presentation around a carrier: CLI transcript, TUI panes, web console, operator controls, labels, keybindings. | Runtime authority, carrier identity, transport admission, or policy creation. |
| `ControlChannel` | A concrete request/result path into or out of a carrier, such as terminal stdin, server JSONL, file-watched control JSONL, HTTP request, WebSocket message, mailbox, or MCP stdio. | Admission by itself. Arrival on a channel is only input evidence until the carrier admits it. |

## Canonical Distinctions

A **Carrier** is semantic authority for a bounded session, but not durable Narada authority. It decides how admitted inputs become runtime behavior and evidence.

A **CarrierHost** is where the carrier runs. It constrains durability, concurrency, storage, and restart mechanics.

A **CarrierTransport** is plumbing. It carries frames but does not decide what they mean.

A **CarrierProtocol** is the language spoken over transports.

A **CarrierRuntimeContract** is the law that makes different carrier implementations compatible.

A **CarrierSurface** is UX. It renders and collects input, but it must not redefine carrier semantics.

## Examples

### Local Interactive CLI Projection

```json
{
  "carrier_kind": "narada-agent-runtime-server",
  "carrier_host": "local-process",
  "carrier_surface": "agent-cli",
  "carrier_transport": "interactive-terminal",
  "carrier_protocol": "narada.carrier.v1"
}
```

### Local Runtime Server

```json
{
  "carrier_kind": "narada-agent-runtime-server",
  "carrier_host": "local-process",
  "carrier_surface": "none-or-supervising-console",
  "carrier_transport": "jsonl-stdio",
  "carrier_protocol": "narada.carrier.v1"
}
```

### TUI Carrier

```json
{
  "carrier_kind": "agent-tui",
  "carrier_host": "local-process",
  "carrier_surface": "ratatui",
  "carrier_transport": "interactive-terminal",
  "carrier_protocol": "narada.carrier.v1"
}
```

### Future Cloudflare Carrier

```json
{
  "carrier_kind": "cloudflare-carrier",
  "carrier_host": "cloudflare-durable-object",
  "carrier_surface": "web-console",
  "carrier_transport": "websocket",
  "carrier_protocol": "narada.carrier.v1"
}
```

Cloudflare topology should not be baked into `CarrierKind` unless it changes runtime semantics. Prefer `cloudflare-carrier` for the semantic family, then use `CarrierHost` and `CarrierTransport` to record whether the realization uses Workers, Durable Objects, Workflows, HTTP, SSE, or WebSockets.

## Observer Implication

Conversation observer behavior belongs in the shared runtime contract, not in a surface. The shared contract defines semantics for:

- observer source metadata and validation;
- `record_only`, `operator_visible`, `agent_visible`, and `conversation_visible`;
- mute and suppression evidence;
- visible interjection evidence;
- provider-turn or no-provider-turn classification.

The surface decides how to render the visible note. The transport decides how the note arrives. The host decides where the state lives. None of those should change what the observer note means.

## Anti-Collapse Rules

- A carrier is not a surface.
- A surface is not a transport.
- A transport is not admission.
- A host is not a carrier kind.
- A protocol frame is not permission.
- A model substrate is not a carrier.
- A carrier session is not durable Agent identity.
- A Cloudflare Worker, Durable Object, or Workflow is a host/posture detail unless it changes the carrier runtime contract.

## Related Concepts

- [`Agent Carrier`](agent-carrier.md) defines the runtime embodiment obligations for one durable Agent in one bounded carrier session.
- [`Carrier Runtime Contract`](../architecture/carrier-runtime-contract.md) defines which runtime meanings must be shared across carriers.
- [`Conversation Observer`](conversation-observer.md) defines observer visibility and interjection semantics that carriers must preserve.
- [`Operator Surface`](operator-surface.md) defines presentation surfaces that may inhabit or observe work without becoming carrier authority.
