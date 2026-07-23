# NARS intelligence-kernel architecture

## Authority ownership

`@narada2/nars-intelligence-kernel-contract` is representation-neutral. It
contains the kernel kind enum, start evidence, health projection, and admitted
turn/input shapes. It does not contain Pi SDK types.

`@narada2/nars-pi-kernel` implements that contract. Its Pi SDK and RPC hosts
are replaceable cognition mechanisms inside one NARS-admitted turn. The hosts
are not allowed to mint session IDs, admit input, append canonical messages,
confirm effects, or decide recovery.

`nars-session-core` remains the durable authority:

```text
client request
  -> runtime request admission and idempotency
  -> durable NARS input/turn records
  -> intelligence kernel
  -> Pi event adapter / kernel observation
  -> session-core lifecycle transition
  -> canonical NARS event and client projection
```

Pi continuation state is memory-only. On recovery, it is discarded and rebuilt
from the NARS journal. An uncertain provider request is not automatically
resent; a later attempt must be explicitly admitted by NARS.

## Tools and artifacts

The Pi-visible catalog is normalized as NARS gateway proxies. Native `read`,
`write`, `edit`, shell, process, and filesystem mutation tools are rejected.
Proxy results carry the NARS agent/session/turn/tool correlation and always
report `effect_confirmation: not-confirmed`; successful cognition is not proof
of an external effect.

Explicit artifact references are observations of NARS-owned artifacts. New
artifact candidates require an injected NARS registrar and arbitrary Pi
filesystem paths are rejected. The adapter never makes a Pi path an artifact
identity.

## SDK and RPC posture

SDK startup uses the pinned `@earendil-works/pi-coding-agent` package by
default, with a NARS-owned in-memory `ModelRuntime`, empty extension/package/
skill/resource projections, disabled native-tool flags, and an explicitly
admitted provider. The projected model runtime delegates transport to the
canonical NARS provider adapter. An injected SDK that cannot satisfy the
required operations fails closed; the compatibility host is available only
when explicitly selected with `runtimeConfig.useBundledPiSdk: false`.

RPC startup requires a command and pinned version, uses strict bounded JSONL,
an empty disposable working directory, and a filtered child environment,
correlates internal request IDs, serializes frame processing, supervises
malformed output/process exit, refuses unsafe nested commands, and can route an
admitted child `tool_call` only through the NARS gateway. The one-way
`tool_result` is evidence with `effect_confirmation: not-confirmed`. A crashed
child is restarted only during explicit NARS recovery without resending the
uncertain request, and the child is killed deterministically on close. The RPC
protocol is never exposed to NARS clients.

## Substitutability

The package contract and adapter fixtures exercise the same admitted-turn
boundary against `narada-native`, `pi-sdk`, and a Pi RPC host. Those fixtures
are not a claim of a production multi-process acceptance run.

Runtime-server lifecycle and substitutability tests belong under
`packages/agent-runtime-server/test`. `packages/agent-pi-tui/test` owns only
client/projection, cursor/replay, PTY, rendering, and client-specific live
acceptance. A genuine multi-process acceptance result must identify the
launcher/binding path, process IDs, durable journal oracle, and external
surface oracles; otherwise it is labelled fixture or partial coverage.
