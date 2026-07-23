# `@narada2/nars-pi-kernel`

The canonical checkout path is `packages/nars-intelligence-runtime-pi`. The
directory name is retained for workspace compatibility; the package identity
and all ownership references are `@narada2/nars-pi-kernel`.

This package implements the representation-neutral NARS intelligence-kernel
contract with an isolated Pi SDK host and a supervised JSONL Pi RPC host.

Pi is a cognition/provider substrate only. NARS owns session identity, input
admission, the durable journal, canonical event ordering, capability
admission, effects, recovery, artifacts, and client attachment. Pi continuation
state is in-memory and disposable; context is rebuilt from NARS-owned records.

The package pins and uses the upstream `@earendil-works/pi-coding-agent` SDK
by default. It creates a NARS-owned in-memory `ModelRuntime`, an empty
resource loader, and an in-memory session manager; it does not discover or
activate ambient Pi resources. Provider execution still delegates to the
admitted NARS provider adapter, so the projected Pi model never owns
credentials or transport. A deployment may explicitly inject an audited
`sdk`/`sessionFactory`, or set `runtimeConfig.useBundledPiSdk` to `false` to
use the isolated compatibility host in environments that intentionally do not
install the pinned SDK. Unsafe or incomplete SDK bindings fail closed.

The independent `pi` carrier and the `agent-pi-tui` NARS projection are not
implemented or redirected here.

See [`docs/dependency-authority-audit.md`](docs/dependency-authority-audit.md)
for the package ownership, dependency, and authority audit.

## Kernel topology

NARS contracts select one interchangeable intelligence kernel behind the same
runtime and session-core boundary:

```text
NARS runtime/session-core
  -> NarsIntelligenceKernel
       |- narada-native
       |- pi-sdk
       `- pi-rpc
```

`agent-cli`, `agent-tui`, `agent-web-ui`, and `agent-pi-tui` are operator
surfaces, not kernel kinds. The surface never selects or observes Pi-specific
protocols. `pi-rpc` is an internal supervised subprocess adapter; NARS clients
never speak its JSONL protocol directly.

Provider/model selection is resolved by `agent-start` and the canonical
invokable-intelligence gateway. The Pi adapter receives only that admitted
binding and NARS gateway tool descriptors. It does not discover credentials,
load extensions, create session files, or expose shell/filesystem tools.

The optional RPC host requires a pinned child command and strict JSONL. It
launches in an empty disposable working directory with a filtered environment,
refuses unsafe command/configuration fields, and can route an explicitly
admitted `tool_call` only through the NARS gateway, returning one-way
`tool_result` evidence marked `effect_confirmation: not-confirmed`. A crashed
child is restarted only through explicit NARS recovery; the uncertain request
is not resent.

Run the bounded verification layers with:

```bash
pnpm --filter @narada2/nars-pi-kernel test
pnpm --filter @narada2/nars-pi-kernel test:live
```
