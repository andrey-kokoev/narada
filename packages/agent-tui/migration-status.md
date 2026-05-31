# Agent TUI Migration Status

## Status

`agent-tui` is a Rust carrier prototype with a bounded runtime scaffold, control JSONL polling, queue admission, transcript projection, terminal rendering, and explicit provider-boundary evidence.

It is not yet a provider-backed interactive carrier. Production `agent-start -Runtime agent-tui` must remain on the non-terminal smoke path until the promotion gate is satisfied.

## Implemented In `@narada2/carrier-protocol`

- Canonical input event, control JSONL, session event, payload reference, and payload policy schemas.
- Validation for source, transport, delivery mode, hold condition, payload policy, tool call/result payloads, diagnostics, and turn terminal states.
- Legacy input/control normalization for current `agent-cli` compatibility.
- Exported JSON fixtures consumed by Rust acceptance tests.

## Implemented In `@narada2/agent-cli`

- Depends on `@narada2/carrier-protocol`.
- Normalizes interactive, programmatic, and control input through protocol-shaped events.
- Emits protocol session evidence for queue admission, completion, interruption, tool calls/results, commands, diagnostics, and system directive hold/release.
- Supports native `narada.carrier.control.input_event.v1` control JSONL records.
- Preserves legacy `system_directive.deliver` control frames through protocol normalization.
- Uses `operator_steering` for working-time operator input instead of `operator_directive`.

## Implemented In `packages/agent-tui`

- Rust crate and library target: `narada-agent-tui` / `narada_agent_tui`.
- CLI flags for identity, session, Site root, control/session JSONL, runtime step/loop, interactive step/loop, smoke loop, render once, Rust toolchain readiness check, and bounded max steps.
- Rust protocol structs and validators for carrier protocol fixtures.
- Rust validator parity now enforces non-object metadata rejection, agent/external source provenance metadata, directive source/provenance rules, stricter control `input_event_id` prefix validation, strict payload-ref shape, and session payload contracts for queue lifecycle, held/released directives, turn state, interrupts, tool calls/results, commands, and diagnostics.
- Control JSONL parser and watcher with appended-record, partial-line, truncation, malformed-line, and unsupported-line handling.
- Append-only session JSONL writer.
- Input queue with idle admission, active-turn queueing, queue summary/drop/clear operations, system-directive hold until composer clear, and release evidence.
- Runtime coordinator for control polling, queue admission, carrier-local queue commands, literal slash input, composer submit, interrupt evidence, held release, and session evidence writing.
- Turn coordinator with provider dispatch boundary recording and explicit `completed_without_provider` terminal evidence.
- Provider dispatch trait plus stub adapter; real provider execution remains disabled.
- Provider boundary acceptance verifies request and terminal evidence both record `recorded_not_dispatched` and `provider_execution_enabled=false`.
- Rendering boundary model converts provider stderr, MCP stderr, known-noise suppression, terminal resize, and payload threshold decisions into mediated diagnostics or payload references instead of raw terminal writes.
- Provider output constructors and transcript projection enforce payload references for oversized or sensitive provider text/tool arguments instead of inlining them into transcript rows.
- MCP fabric boundary acceptance verifies disabled-by-default posture, policy-bound tool visibility after admission, and valid tool request/result evidence records.
- MCP fabric transport skeleton parses carrier MCP config, derives policy-bound visibility from configured tools, resolves tools to stdio server launch specs, and prepares evidenced JSON-RPC `tools/call` requests without spawning live transport yet.
- MCP JSON-RPC contract builds newline-delimited `tools/call` requests, parses success/error responses, and classifies responses into MCP tool result evidence summaries.
- MCP stdio process I/O can write one prepared JSON-RPC request, read one response line, validate response identity, classify the result, and has a process-backed one-shot execution wrapper.
- MCP process supervisor contract models server lifecycle states, initialize/initialized handshake frames, readiness gating, a bounded restart decision, and recovery diagnostics as session evidence.
- MCP runtime execution bridge owns per-server supervisor state, gates tool calls on readiness, writes tool request/result evidence to session JSONL, and records recovery diagnostics when injected execution fails.
- Provider tool-call bridge converts provider `tool_call_request` outputs into MCP tool requests, validates inline JSON arguments, ignores non-tool output, and executes admitted calls through the supervised MCP runtime bridge.
- Turn coordinator accepts an injectable provider tool-call executor and writes provider-origin tool request/result evidence before turn completion when the bridge is supplied.
- Reusable MCP process executor implements the runtime tool executor boundary, executes initialize/initialized handshake when a server process is first spawned, caches one stdio child per server, replaces stale launch specs, records elapsed duration, preemptively terminates blocked reads at timeout, classifies timeout failures, and drops failed processes from the pool.
- Transcript projection and store for operator/system input, system directive hold/release, provider output placeholders, provider tool-call placeholders, and terminal turn status.
- Layout, status, composer, transcript, and aggregate app view models.
- Ratatui renderer for transcript/status/composer regions.
- Renderer acceptance verifies nonblank buffer rendering, core region text, stable layout rectangles, and preserved composer draft in compact frames.
- Terminal lifecycle state guard with clean leave semantics after normal exit and render-loop error.
- Terminal input decoding, input tick reduction, composer draft reducer, and render-loop action reducer.
- `tui-textarea` dependency and `TextareaComposer` adapter scaffold with the same submit, clear, interrupt, and draft-state effects as the current reducer.
- Terminal input tick now applies decoded key intents through `TextareaComposer` while preserving the public `ComposerDraftState` and `TerminalInputTickOutcome` bridge.
- Interactive render-loop state now owns a long-lived `TextareaComposer`; runtime and view APIs receive draft snapshots only at their existing boundaries.
- Composer region rendering now uses the `tui-textarea` widget path, with an explicit live-composer render entry point available beside snapshot rendering.
- Terminal interactive draw loop now calls the live-composer renderer so textarea cursor and viewport state are preserved during interactive rendering.
- Terminal drawing has a backend-generic helper used by both real terminal sessions and scripted TestBackend frame acceptance.
- `TerminalLifecycleHarness` records enter/draw/leave behavior for scripted terminal backends without binding tests to process stdout.
- `TerminalSession` and `TerminalLifecycleHarness` are both admitted through the same `InteractiveTerminalFrame` contract, with scripted draw-through-contract acceptance.
- Interactive loop body is extracted behind injectable terminal, input, and clock seams; production `--interactive-loop` now uses the same driver as scripted acceptance.
- Injected-loop acceptance covers active-turn operator submit queuing, exit input handling, input read failure surfacing, malformed control JSONL surfacing, and final draw evidence.
- Injected-loop test fixtures now use shared constructors for runtime paths, terminal frame capture, input outcomes, and deterministic clocks.
- Buffer-level live-composer rendering acceptance covers active-turn prompt text, visible live draft content, queued-note status, and stale snapshot exclusion.
- Composer redraw acceptance verifies key ticks preserve draft text across redraws, backspace updates rendered text, and submit clears draft while admitting operator text through the bridge once.
- Interactive runtime module that owns polling, held release, one-turn drain, transcript ingestion, and view assembly.
- Smoke runner API: `AgentTuiSmokeSession`, `run_interactive_smoke_step`, and `interactive_smoke_step_summary_lines`.
- Smoke acceptance covers canonical system directive delivery, held directive release, queued operator FIFO ordering, interrupt evidence, malformed control JSONL, and provider-boundary transcript rows.
- Narada proper `agent-start` admits `agent-tui` as a distinct runtime but launches only bounded non-terminal `--interactive-step-once` by default.
- Agent-start launch metadata names the admitted bounded runtime slice, the gated terminal interactive loop, and the unsatisfied promotion gate.
- Agent-start launch metadata keeps provider execution disabled and records the missing provider adapter, evidence, streaming, and tool-call contracts required before admission.
- Agent-start launch metadata keeps Site MCP fabric access disabled and records the missing Rust MCP client, policy visibility, tool request/response, and tool evidence contracts required before admission.
- Agent-start uses named metadata builders for the shared `agent-tui` terminal, provider, and MCP promotion gates instead of inline ad hoc gate objects.
- Agent-start promotion metadata includes a machine-readable checklist for Rust test availability, terminal-loop acceptance, carrier command acceptance, rendering/diagnostic boundary acceptance, payload-reference policy, provider adapter admission, MCP fabric client admission, Site rollout acceptance, and launch metadata runtime slice evidence.
- Agent-start launch metadata includes a concrete `site_rollout_acceptance` matrix for all launcher-registry Narada Sites, with per-Site side-by-side agent-cli/agent-tui evidence requirements and default promotion blocked until acceptance is current.
- `tools/agent-start/agent-tui-rollout-acceptance.mjs` builds a non-launching rollout acceptance report from the launch metadata, accepts explicit `--known-site-root site=path` root resolution, accepts per-Site `--agent-cli-evidence site=path` and `--agent-tui-evidence site=path`, validates evidence as complete live authoritative `narada.agent_start.result.v0` launch packets for the expected runtime, `launching` status, `dry_run=false`, `exec=true`, authoritative agent-start and carrier-session records, event/session IDs, carrier-specific session/control paths, bounded `agent-tui` smoke slice, and matching Site root, marks a Site accepted only when both evidence paths are valid for that Site, names unresolved or missing Site roots and missing, incomplete, or invalid side-by-side evidence, and can write `.narada/crew/agent-tui-rollout-acceptance/latest.json`.
- Agent-start launch metadata exposes the `agent-tui` Rust toolchain readiness preflight command, expected blocker, and exit-code semantics.
- Agent-start tests assert production launch does not opt into `--interactive-smoke-loop`, `--persistent-smoke-session`, legacy `--runtime-loop`, or `--max-steps`.

## Promotion Gate

`agent-tui` must stay on the non-terminal one-shot smoke launch path until all of these are true:

- Rust tests run in CI or a documented local toolchain with MSVC `link.exe` available.
- `--interactive-smoke-loop --max-steps <n>` passes fixture acceptance for queued operator input, held system directives, release, interrupt, malformed control JSONL, and transcript projection.
- `--interactive-loop --max-steps <n>` has scripted terminal-frame acceptance that verifies no blank frame, stable layout rectangles, preserved composer draft, and clean terminal leave on exit/error.
- Provider dispatch remains explicitly disabled unless a real provider adapter is admitted with its own authority and evidence contract.
- Site MCP access remains explicitly disabled unless a Rust MCP fabric client is admitted with policy-bound tool visibility.
- `agent-start` launch metadata names the runtime slice accurately: smoke step, smoke loop, or terminal interactive loop.
- Production `agent-start -Runtime agent-tui` changes from `--interactive-step-once` only after the above checks are green and the launch packet records terminal rendering as admitted.

## Promotion Gate Gap Audit

Current launch metadata now names the target-contract gaps that were previously implicit:

- Carrier command acceptance: `/queue`, `/queue clear`, `/queue drop <index>`, and `//literal` slash input are not yet accepted as a complete carrier-local command surface.
- Rendering and diagnostic boundary acceptance: provider stderr, MCP stderr, known-noise suppression, payload threshold policy, and resize behavior are not yet proven as mediated events that cannot corrupt transcript or composer.
- Payload reference policy acceptance: large or sensitive tool/provider payloads do not yet have a deterministic session policy exposed through carrier metadata and enforced at transcript boundaries.
- Provider adapter admission: real provider dispatch, streaming output, and provider-origin tool-call mediation remain unimplemented.
- MCP fabric client admission: Rust-side Site MCP discovery, policy-bound visibility, request/response, and tool evidence remain unimplemented.
- Site rollout acceptance: known Sites are now named in launch metadata with required side-by-side evidence, but have not yet run side by side on `agent-cli` and `agent-tui` with clean launch and recovery evidence.

## Live Rollout Evidence

Latest rollout report:

```text
D:\code\narada\.narada\crew\agent-tui-rollout-acceptance\latest.json
```

Current report state:

The rollout scope is the launcher registry, not the earlier four-site pilot. Current matrix Sites:

- `narada-proper`
- `narada-andrey`
- `narada-staccato`
- `narada-revolution`
- `narada-timour-marketing-agent`
- `narada-utz`
- `narada-sonar`
- `smart-scheduling`
- `thoughts-project`

All launcher-registry Sites now have accepted side-by-side `agent-cli` and bounded `agent-tui` evidence.

Recorded accepted rollout evidence:

```text
narada-proper agent-cli: D:\code\narada\.narada\crew\agent-start-results\agent_start_20260531_000417547_narada_architect.result.json
narada-proper agent-tui: D:\code\narada\.narada\crew\agent-start-results\agent_start_20260531_041426614_narada_architect.result.json
narada-andrey agent-cli: C:\Users\Andrey\Narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-19_e5147cef.result.json
narada-andrey agent-tui: C:\Users\Andrey\Narada\.ai\runtime\agent-start-results\evt-2026-05-31_04-27-29_a23016ab.result.json
narada-staccato agent-cli: C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\Staccato\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-20_131e872d.result.json
narada-staccato agent-tui: C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\Staccato\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_05-04-35_975e949a.result.json
narada-revolution agent-cli: C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\!Revolution\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-22_c13890e1.result.json
narada-revolution agent-tui: C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\!Revolution\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_05-04-38_77515bed.result.json
narada-timour-marketing-agent agent-cli: C:\Users\Andrey\Vose Software BE\Timour Koupeev - MarketingAgent\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-23_466ee6d9.result.json
narada-timour-marketing-agent agent-tui: C:\Users\Andrey\Vose Software BE\Timour Koupeev - MarketingAgent\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_05-04-41_c370a882.result.json
narada-utz agent-cli: C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\Utz\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-24_747be7a9.result.json
narada-utz agent-tui: C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\Utz\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_05-04-44_fc733c37.result.json
narada-sonar agent-cli: D:\code\narada.sonar\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-25_28290811.result.json
narada-sonar agent-tui: D:\code\narada.sonar\.ai\runtime\agent-start-results\evt-2026-05-31_05-04-28_cb53f734.result.json
smart-scheduling agent-cli: D:\code\smart-scheduling\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-26_b975144f.result.json
smart-scheduling agent-tui: D:\code\smart-scheduling\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_05-04-31_40fb2fd0.result.json
thoughts-project agent-cli: D:\code\thoughts\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-27_275473a1.result.json
thoughts-project agent-tui: D:\code\thoughts\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_05-04-47_8b47a838.result.json
```

Default promotion is no longer blocked on launcher-registry Site side-by-side rollout evidence. Provider execution, MCP fabric execution, and terminal promotion remain gated separately.

## Site Launcher Propagation

The following Site-local launcher copies are outside the Narada proper Git repository and therefore are not committed with this package. They were updated in place to admit the bounded `agent-tui` runtime slice and verified to carry the same SHA-256 hash:

```text
sha256: 3f25e2dbd6e65b47174af8b606fae3277a4882ecdcdc285702afe9ebdd532340

C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\Staccato\.narada\tools\agent-start\start-agent.mjs
C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\!Revolution\.narada\tools\agent-start\start-agent.mjs
C:\Users\Andrey\Vose Software BE\Timour Koupeev - MarketingAgent\.narada\tools\agent-start\start-agent.mjs
C:\Users\Andrey\OneDrive - Global Maxima LLC\!Business\!Clients\Utz\.narada\tools\agent-start\start-agent.mjs
D:\code\thoughts\.narada\tools\agent-start\start-agent.mjs
```

## Current Verification

Passing:

```powershell
pnpm --filter @narada2/carrier-protocol test
node --test tools/agent-start/start-agent.test.mjs
cargo fmt -- --check
cmd /d /s /c "call ""C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"" -arch=x64 -host_arch=x64 >nul && cd /d D:\code\narada\packages\agent-tui && cargo test"
```

Plain non-developer shells may still report blocked:

```powershell
cargo test
node D:\code\narada\tools\agent-start\check-agent-tui-rust-toolchain.mjs
```

Reason: `link.exe` and Windows SDK libraries are available after `VsDevCmd.bat` loads the developer environment. They may not be visible in ordinary shells; the preflight reports this as `missing_msvc_link_exe_on_path` and `windows_sdk_lib_not_loaded_in_LIB`.

## Rust Toolchain Recovery

Use one of these operator paths before treating `cargo test` as meaningful for `agent-tui`:

```powershell
where.exe link
```

If that does not find `link.exe`, install or modify Visual Studio Build Tools with the C++ build tools workload. If `link.exe` exists but `gdi32.lib` is missing, install or modify Visual Studio Build Tools to include a Windows SDK, then run from a Developer PowerShell or import the toolchain environment before testing.

Readiness command:

```powershell
node D:\code\narada\tools\agent-start\check-agent-tui-rust-toolchain.mjs
```

Agent-start launch results expose the same preflight as `agent_tui_launch.rust_toolchain_readiness`.

Expected verification after recovery:

```powershell
cmd /d /s /c "call ""C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"" -arch=x64 -host_arch=x64 >nul && cd /d D:\code\narada\packages\agent-tui && cargo test"
```

If `cargo test` still fails after `VsDevCmd.bat` reports a ready toolchain, treat the new failure as an `agent-tui` implementation issue instead of a toolchain blocker.

## Next Step

Collect bounded non-terminal `agent-tui` launch evidence for `narada-sonar` and `smart-scheduling`, then rewrite the rollout report with all four Sites. Do not use the workspace launcher for this smoke evidence; it is operator-surface orchestration and may open visible terminals.

## Live Rollout Evidence Commands

Primary bounded collection path:

```powershell
Set-Location D:\code\narada
.\tools\agent-start\Collect-AgentTuiRolloutEvidence.ps1
```

The script verifies the existing seed evidence paths, refreshes only the missing non-proper `agent-tui` smoke evidence by default, then rewrites the rollout acceptance report. Site roots and seed evidence paths are parameterized, so a moved checkout or newer baseline can be supplied without editing the script. `-RefreshAgentCli` is refused unless paired with `-AllowInteractiveAgentCliRefresh`, because `agent-cli` baseline collection can block at an operator prompt.

Manual fallback commands are below. Run these from a shell that has the Rust linker environment loaded. Each `agent-tui` command is bounded by `--interactive-step-once` through the Site launcher and should exit after one smoke step.

Narada proper:

```powershell
Set-Location D:\code\narada
.\narada.ps1 agent-start -Agent narada.architect -Runtime agent-cli -Exec
.\narada.ps1 agent-start -Agent narada.architect -Runtime agent-tui -Exec
```

Narada user Site:

```powershell
Set-Location C:\Users\Andrey\Narada
.\narada-andrey.ps1 agent-start -Agent narada-andrey.resident -Runtime agent-cli -Exec
.\narada-andrey.ps1 agent-start -Agent narada-andrey.resident -Runtime agent-tui -Exec
```

Narada Sonar:

```powershell
Set-Location D:\code\narada.sonar
.\narada-sonar.ps1 agent-start -Agent sonar.resident -Runtime agent-cli -Exec
.\narada-sonar.ps1 agent-start -Agent sonar.resident -Runtime agent-tui -Exec
```

Smart Scheduling:

```powershell
Set-Location D:\code\smart-scheduling
.\narada-smart-scheduling.ps1 agent-start -Agent smart-scheduling.resident -Runtime agent-cli -Exec
.\narada-smart-scheduling.ps1 agent-start -Agent smart-scheduling.resident -Runtime agent-tui -Exec
```

Then write the rollout report with the collected launch result paths:

```powershell
Set-Location D:\code\narada
node tools\agent-start\agent-tui-rollout-acceptance.mjs `
  --site-root D:\code\narada `
  --known-site-root narada-andrey=C:\Users\Andrey\Narada `
  --known-site-root narada-sonar=D:\code\narada.sonar `
  --known-site-root smart-scheduling=D:\code\smart-scheduling\.narada `
  --agent-cli-evidence narada-proper=D:\code\narada\.narada\crew\agent-start-results\agent_start_20260531_000417547_narada_architect.result.json `
  --agent-tui-evidence narada-proper=D:\code\narada\.narada\crew\agent-start-results\agent_start_20260531_041426614_narada_architect.result.json `
  --agent-cli-evidence narada-andrey=C:\Users\Andrey\Narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-19_e5147cef.result.json `
  --agent-tui-evidence narada-andrey=C:\Users\Andrey\Narada\.ai\runtime\agent-start-results\evt-2026-05-31_04-27-29_a23016ab.result.json `
  --agent-cli-evidence narada-sonar=D:\code\narada.sonar\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-25_28290811.result.json `
  --agent-tui-evidence narada-sonar=<narada-sonar-agent-tui-launch-result.json> `
  --agent-cli-evidence smart-scheduling=D:\code\smart-scheduling\.narada\.ai\runtime\agent-start-results\evt-2026-05-31_00-04-26_b975144f.result.json `
  --agent-tui-evidence smart-scheduling=<smart-scheduling-agent-tui-launch-result.json> `
  --write
```
