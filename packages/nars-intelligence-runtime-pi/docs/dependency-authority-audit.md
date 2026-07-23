# Dependency and authority audit

This package is a replaceable NARS intelligence-kernel implementation. It is
not a second session runtime or a client protocol implementation.

## Authority map

| Concern | Authoritative owner | Pi-kernel role |
| --- | --- | --- |
| Agent and NARS session identity | `@narada2/nars-session-core` / `@narada2/agent-runtime-server` | Carries the admitted identifiers for correlation only |
| Input admission, idempotency, queueing, and turn lifecycle | NARS runtime and session-core | Receives only an already admitted turn; Pi acceptance cannot admit input |
| Canonical conversation and durable event ordering | NARS event journal and session-core | Emits normalized observations and presentation evidence; never canonical events |
| Capability/tool admission and external effects | NARS capability gateway | Exposes only gateway proxies and returns non-confirming tool evidence |
| Provider, model, thinking, endpoint, and credential selection | `agent-start` and the canonical invokable-intelligence/provider adapters | Consumes the admitted binding; performs no ambient discovery or login |
| Recovery and artifact identity | NARS runtime, journal, and artifact stores | Discards/rebuilds disposable continuation state and registers only NARS artifact references |
| Client attachment and projection | Existing NARS operator surfaces | Provides no Pi protocol or Pi-native client semantics |
| Provider cognition mechanics | `@narada2/nars-pi-kernel` | Runs the isolated Pi SDK/RPC substrate inside one admitted turn |

The native kernel and this Pi kernel are selected behind the same
`@narada2/nars-intelligence-kernel-contract`. The operator surface is a
separate launch dimension. In particular, `agent-pi-tui` is a NARS projection
client, while the independent `pi` carrier remains a separate carrier.

## Dependency posture

| Dependency | Purpose | Authority restriction |
| --- | --- | --- |
| `@narada2/nars-intelligence-kernel-contract` | Representation-neutral public contract and native conformance adapter | Contains no Pi SDK types and owns no durable session state |
| `@earendil-works/pi-coding-agent@0.80.10` | Pinned in-process Pi SDK substrate | Used behind the private adapter; session manager is in-memory, resources/extensions/packages/skills are empty, native tools are disabled, and provider transport remains NARS-owned. This is not an OS/process sandbox. |
| Node child-process APIs | Optional Pi RPC supervisor | Only a pinned command/version may start; bounded JSONL, sanitized environment, unsafe flags/commands, and direct client access are refused |

Pi source is not vendored. The upstream attribution and license notice is in
`LICENSE-PI-NOTICE.md`. Pi session files, extension state, credentials, and
filesystem paths are not package-owned artifacts or canonical identities.

## Boundary evidence

- Public declarations use only representation-neutral NARS records and
  `Record<string, unknown>` host seams; Pi `AgentSession`, message, tool, and
  RPC command types do not cross the package contract.
- `createPiSdkHost()` uses a NARS-projected in-memory `ModelRuntime`, an
  in-memory session manager, an empty resource loader, and NARS-governed retry
  settings. Its evidence explicitly says `process_sandbox: not-provided` and
  `execution_boundary: in-process-adapter`; a supplied SDK that cannot satisfy
  the adapter checks fails closed. No process-level ambient-resource negative
  claim is made for the SDK mode.
- `createPiRpcHost()` starts in an empty disposable working directory, rejects
  ambient/session/resource/native launch flags and unsafe nested commands,
  filters inherited user/resource environment, bounds every JSONL frame, and
  routes admitted child tool calls only through the NARS gateway with
  non-confirming evidence. Its evidence says
  `execution_boundary: filtered-child-process`; this is a filtered process
  boundary, not an OS sandbox. It restarts only during explicit recovery
  without resending an uncertain turn.
- `createNarsPiCapabilityGateway()` attaches NARS correlation and authority
  evidence to every call. A successful Pi tool result is always
  `effect_confirmation: not-confirmed`.

The durable proof is the contract suite, event-normalization fixtures,
tool-boundary and recovery tests, and runtime-server lifecycle tests under
`packages/agent-runtime-server/test`. Client/PTY evidence remains under
`packages/agent-pi-tui/test`; it is accepted as genuine only when its evidence
record names the production launcher/binding path and independent durable and
external oracles. Fixture and in-process tests are labelled as such.
