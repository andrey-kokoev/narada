# NARS Remote Projection Gateway

## Purpose

This document defines the target shape for exposing local NARS session observation to a remote browser through Cloudflare without making Cloudflare the local runtime owner and without exposing raw local NARS endpoints directly.

The local session-management contract remains in [`nars-session-management.md`](nars-session-management.md). The runtime contract remains in [`nars-runtime-contract.md`](nars-runtime-contract.md). This document defines the remote projection and admission boundary that may sit in front of local NARS sessions.

## Target Outcome

A remote operator can open a Cloudflare-hosted page and observe one or more local NARS sessions through an authenticated, governed projection:

1. Cloudflare authenticates the operator.
2. The Worker classifies the request and refuses unsupported protocol or authority.
3. The Worker reaches a local projection gateway through `cloudflared` or equivalent tunnel transport.
4. The local gateway discovers NARS sessions from Site-local session indexes.
5. The local gateway verifies liveness through NARS health before presenting sessions as attachable.
6. The local gateway streams projected event rows, not raw local internals by default.
7. Remote operator input is unavailable until a separate admission slice explicitly grants it.

## Non-Goals

- Do not expose raw loopback NARS `/events` or `/health` directly to the public internet.
- Do not make `agent-web-ui` the remote admission boundary.
- Do not require Cloudflare to run `agent-cli`, `agent-tui`, or the local provider runtime.
- Do not make `cloudflared`, WebSocket, SSE, HTTP, Workers, Durable Objects, or Pages into NARS semantics.
- Do not grant remote operator input, host commands, tool execution, or lifecycle mutation in the first read-only observation slice.

## Topology

```text
Cloudflare Page / remote browser
  -> Cloudflare Access-authenticated Worker
  -> NARS remote projection API
  -> cloudflared tunnel or equivalent governed transport
  -> local nars-remote-gateway process
  -> local NARS session endpoints
       session index files
       HTTP /health
       WebSocket /events
```

Cloudflare is ingress and policy. The local NARS session remains the runtime authority.

## Ownership

| Concern | Owner |
| --- | --- |
| Local session truth | Local NARS session: Site-local records, events, health, and control input. |
| Local session discovery | NARS session-management index under the Site root. |
| Local remote projection gateway | Narada-owned NARS gateway process. |
| Public remote ingress | Cloudflare Worker protected by Cloudflare Access or equivalent identity. |
| Transport | `cloudflared`, HTTP, WebSocket, SSE, or another governed tunnel. |
| Browser rendering | Cloudflare Page or `agent-web-ui`-derived client shell. |
| Operator input admission | Separate future authority slice, not implied by observation. |

## Authority Invariants

Transport is not admission.

A remote request must be classified before it can touch a local NARS endpoint. The Worker/gateway pair must decide whether the request is one of:

- session discovery read;
- health read;
- event subscription read;
- diagnostics read;
- operator input request;
- carrier command request;
- unsupported request.

The first implementation admits only read operations. Operator input and command requests must be refused with explicit diagnostic evidence until their own policy exists.

## Public Remote API Target

The remote API should be protocol-shaped and narrow:

| Method | Path | First-slice status | Meaning |
| --- | --- | --- | --- |
| `GET` | `/api/nars/sessions` | admitted | List visible local NARS sessions after health classification. |
| `GET` | `/api/nars/sessions/:session_id/health` | admitted | Read live health for a selected session. |
| `WS` or `GET` | `/api/nars/sessions/:session_id/events` | admitted | Subscribe to projected events for a selected session. |
| `POST` | `/api/nars/sessions/:session_id/input` | refused | Future operator input boundary. |
| `POST` | `/api/nars/sessions/:session_id/command` | refused | Future command boundary. |

The API must reject unsupported methods and protocol versions rather than best-effort reinterpretation.

## Projection Levels

Remote event output must be projection-level aware:

| Level | Remote default | Meaning |
| --- | --- | --- |
| `conversation` | yes | User and assistant messages only. |
| `operations` | allowed | Conversation plus tool, turn, and operation posture summaries. |
| `diagnostics` | restricted | Health, reconnect, MCP faults, runtime diagnostics. |
| `raw` | privileged | Raw event payloads for debugging. |

The default remote page should request `conversation` or `operations`. `raw` must require stronger authority than ordinary observation.

## Local Gateway Responsibilities

The local gateway is not a browser UI. It is a local policy/projection process that provides a stable tunnel target for Cloudflare.

It should:

1. Enumerate known Site roots only through explicit configuration, launch registry, or CLI arguments.
2. Read NARS session indexes using the session-management contract.
3. Verify active candidates through `/health` before exposing them as active.
4. Proxy or transform `/events` into projected remote events.
5. Bound replay size and event retention.
6. Redact or suppress fields according to projection level.
7. Refuse operator input and commands in the read-only slice.
8. Emit its own audit/log events for remote access and refusals.

It should not:

- scan arbitrary filesystem roots;
- guess ports from process lists;
- expose local file paths in default remote views;
- expose local NARS control frames without admission;
- depend on an `agent-cli` window being open.

## Cloudflare Worker Responsibilities

The Worker is the public admission and routing boundary.

It should:

1. Require Cloudflare Access or equivalent identity for all routes.
2. Map authenticated identity to Narada remote observation authority.
3. Enforce CORS and origin policy.
4. Validate session ids and projection level requests.
5. Rate-limit and bound replay requests.
6. Relay WebSocket/SSE/HTTP transport to the local gateway.
7. Return refusal objects for unsupported methods or insufficient authority.
8. Avoid embedding tunnel secrets, local credentials, or local machine assumptions in browser JavaScript.

## First Slice: Read-Only Observation

The first implementation should provide:

```text
GET /api/nars/sessions
GET /api/nars/sessions/:session_id/health
WS  /api/nars/sessions/:session_id/events?projection=conversation|operations
```

It should not provide:

```text
POST /api/nars/sessions/:session_id/input
POST /api/nars/sessions/:session_id/command
projection=raw for ordinary users
```

The first slice is complete when a remote browser can see authenticated session list, live health, and event updates for a local NARS session, while operator input is refused with explicit evidence.

## Relationship To `agent-web-ui`

`agent-web-ui` remains a client projection surface. It may be reused as the browser shell for a Cloudflare Page, but it must point at the remote gateway API rather than directly at local loopback endpoints.

Direct tunneling to `agent-web-ui` is acceptable only as a prototype. It is not the target admission shape because `agent-web-ui` is not responsible for remote authority policy.

## Relationship To Cloudflare Carrier

This gateway is not the same thing as `cloudflare-carrier` running a cloud-hosted agent runtime.

Cloudflare carrier is a carrier/runtime family for Cloudflare-hosted execution. NARS remote projection gateway is a remote observation/admission facade for local NARS sessions. Both may use Workers, WebSockets, HTTP, and Cloudflare Access, but those are transport and host choices, not shared semantics.

## Open Decisions

1. Whether event streaming should be WebSocket-only or support SSE for read-only projection.
2. Whether the local gateway lives in `@narada2/agent-runtime-server`, a new package, or the CLI as an initial executable wrapper.
3. Whether Cloudflare Access identity maps to Narada operator identity through User Site config, Site config, or a dedicated remote-access policy file.
4. How much redaction is required for `operations` projection before it is safe over remote observation.
5. Whether remote observation should record durable audit events in the local Site or only gateway logs for the first slice.

## Implementation Milestones

1. Document this target and link it from NARS session-management and Cloudflare transport docs.
2. Add a local read-only gateway that serves session list and health from known Site roots.
3. Add projected event streaming through the local gateway.
4. Add Cloudflare Worker facade with Access-authenticated read-only routes.
5. Add Cloudflare Page configuration for the web UI client against the Worker API.
6. Add remote observation tests for refusal of input/command methods.
7. Add an explicit operator-input admission design before enabling remote control.
