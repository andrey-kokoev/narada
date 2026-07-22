# `@narada2/agent-pi-tui`

`agent-pi-tui` is a Narada Agent Runtime Server (NARS) projection client. It
uses `@earendil-works/pi-tui` for terminal lifecycle and rendering, while
NARS remains the owner of the session journal, provider execution, tool
execution, input admission, recovery, and artifacts.

It is a sibling of the other NARS operator projections, not a replacement for
the independent `pi` carrier:

```text
NARS
 ├── agent-cli
 ├── agent-tui
 ├── agent-web-ui
 └── agent-pi-tui
```

The package deliberately does **not** depend on or launch Pi's coding-agent,
provider, RPC, extension, tool, or session-persistence runtime. Closing this
process detaches the projection; it does not send `session.close` unless the
operator explicitly enters `/exit`.

## Usage

```powershell
narada-agent-pi-tui --attach ws://127.0.0.1:4317/events
```

Workspace launches normally pass a launch-binding file instead:

```powershell
narada-agent-pi-tui --launch-binding .ai/runtime/operator-projection-launch-bindings/session.json
```

## Upstream presentation provenance

The terminal substrate is consumed as a public dependency from
`@earendil-works/pi-tui`. Narada-owned components only implement the public
`Component` shape and consume Narada projection view models. No Pi interactive
runtime source is copied into this package.

## Unsupported Pi behavior

Pi providers, Pi tools, shell escapes (`!command`), Pi session files,
compaction, retry authority, branching, and executable extensions are not
available here. Commands that change intelligence are admitted through
NARS's `runtime.intelligence.reconfigure` method when that method is exposed.

## Verification

```powershell
pnpm --filter @narada2/agent-pi-tui typecheck
pnpm --filter @narada2/agent-pi-tui test
pnpm --filter @narada2/agent-pi-tui test:live:production-binding  # opt-in launcher matrix
```

The normal test suite does not start providers, runtimes, browsers, or sibling
surface binaries. The gated live suite does. Its broad scenario is a
**baseline-live-acceptance**. P0/P1/P2 probes default to direct-runtime
**fixture-boundary** evidence; passing `--production-launch` runs the same
probe through the canonical workspace launcher and records
**partial-production-launch** evidence instead.

The current four-surface scenario is deliberately named and reported as a
**baseline-live-acceptance**, not as complete live coverage. Every opt-in
probe retains a `narada.agent.live_evidence.v2` record with a canonical
posture (`fixture-boundary`, `partial-production-launch`, or
`production-launch`), process IDs, durable and external oracles, negative
assertions, and—when applicable—the validated
`narada.operator_projection_launch_binding.v1` record. The remaining
production-launch obligations and completion gate are defined in
[`docs/testing/agent-pi-tui-live-e2e-coverage.md`](../../docs/testing/agent-pi-tui-live-e2e-coverage.md).

```powershell
# Build the real sibling agent-tui binary first, or point the test at one.
$env:NARADA_AGENT_TUI_BIN = 'D:\code\agent-tui\target\debug\narada-agent-tui.exe'
pnpm --filter @narada2/agent-pi-tui test:baseline-live
```

It starts an ephemeral CLI-launched NARS runtime with a fixture provider and
real `events.jsonl`, then attaches `agent-cli`, `agent-tui`, `agent-web-ui`,
and `agent-pi-tui`. It drives durable input, streamed assistant output, MCP
tool admission/execution/refusal, queue steering, provider failure/recovery,
artifact registration, cursor-backed detach/reattach, and an admitted session
close. The additional gap scripts cover restart, cancellation, authority
negatives, transport/idempotency, uncertain retry, MCP faults, PTY boundaries,
and determinism through the direct runtime fixture harness by default, with an
explicit production-launch mode. Kernel
substitutability is owned and executed by `@narada2/agent-runtime-server`, not
this projection package. The baseline requires the sibling `agent-cli` launcher, a debug `agent-tui`
binary (override with `NARADA_AGENT_TUI_BIN`), and a headless Edge/Chrome
binary (override with `NARADA_LIVE_BROWSER_PATH`). The command is explicitly gated; invoking the script without
`--enable-live-e2e` or `NARADA_AGENT_PI_TUI_LIVE_E2E=1` exits as a skip.
