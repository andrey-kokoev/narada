# Agent TUI Migration Status

## Status

`agent-tui` is a Rust carrier prototype with a bounded runtime scaffold, control JSONL polling, queue admission, transcript projection, terminal rendering, and explicit provider-boundary evidence.

It is not yet a provider-backed interactive carrier. Production `agent-start -Runtime agent-tui` must remain on the bounded non-terminal runtime slice until the promotion gate is satisfied.

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
- Turn coordinator with provider dispatch boundary recording and carrier-validated, schema-marked explicit `completed_without_provider` terminal evidence built through shared Rust/TypeScript payload factories.
- Provider dispatch trait plus carrier-validated, schema-marked provider request/output payload contracts built through shared Rust/TypeScript factories, centralized adapter factory, stub, and scripted admitted adapters; real provider execution remains disabled outside explicit adapter admission.
- Provider adapter admission boundary distinguishes disabled runtime, refused runtime, configured-without-adapter posture, explicit requested adapter kind via `NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND`, typed adapter-registry rejection for unknown adapter kinds, and admitted scripted adapter execution; known production adapters are refused as `provider_adapter_not_implemented:<kind>` until a concrete production adapter exists.
- Provider boundary acceptance verifies request and terminal evidence both record `recorded_not_dispatched` and `provider_execution_enabled=false`.
- Provider request evidence carries provider runtime posture, configured provider/model when present, and separate adapter refusal reason so disabled/configured turns are reconstructable from session JSONL.
- Provider boundary acceptance verifies ordered provider text deltas project as one accumulated agent transcript message for the turn.
- Provider runtime config is explicit: provider/model env reaches `configured` runtime posture without carrying execution authority; adapter admission separately records configured-without-adapter, unknown-adapter, known-unimplemented adapter refusal, and explicit admitted scripted execution.
- Provider runtime CLI acceptance verifies the binary reports disabled-by-default, refused missing-model, configured provider/model/streaming posture, configured-without-adapter posture, unknown adapter refusal, and known-unimplemented adapter refusal; runtime-step and interactive-step evidence both carry separate runtime and adapter posture.
- Agent-start launch env forces `NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION=false` for the bounded runtime slice and records that provider environment gate in launch metadata.
- Rendering boundary model converts provider stderr, MCP stderr, known-noise suppression, terminal resize, and payload threshold decisions into mediated diagnostics or payload references instead of raw terminal writes.
- Provider output constructors and transcript projection enforce payload references for oversized or sensitive provider text/tool arguments instead of inlining them into transcript rows.
- MCP fabric boundary acceptance verifies disabled-by-default posture, policy-bound tool visibility after admission, and valid tool request/result evidence records.
- MCP fabric transport parses carrier MCP config, validates the `mcpServers` map and server record shapes, normalizes nonblank top-level and server metadata, validates nonblank stdio transport values, derives policy-bound visibility from one unambiguous configured nonblank array tool list, resolves tools to nonblank stdio server launch commands and nonblank string args, and prepares evidenced JSON-RPC `tools/call` requests for supervised stdio execution.
- MCP JSON-RPC contract builds newline-delimited `tools/call` requests, parses success/error responses, and classifies responses into MCP tool result evidence summaries.
- MCP stdio process I/O can write one prepared JSON-RPC request, read one response line, validate response identity, classify the result, and has a process-backed one-shot execution wrapper.
- MCP process supervisor contract models server lifecycle states, initialize/initialized handshake frames, readiness gating, a bounded restart decision, and recovery diagnostics as session evidence.
- MCP runtime execution bridge owns per-server supervisor state, gates tool calls on readiness, writes tool request/result evidence to session JSONL, records MCP runtime posture on tool evidence, and records recovery diagnostics when injected execution fails.
- Runtime-step and interactive runtime construction wire the provider tool-call executor from MCP runtime config; production launcher metadata still keeps MCP fabric disabled until live Site MCP admission is explicitly promoted.
- Provider tool-call bridge converts provider `tool_call_request` outputs into MCP tool requests, validates inline JSON arguments, ignores non-tool output, and executes admitted calls through the supervised MCP runtime bridge.
- Provider tool-call executor factory constructs a supervised reusable MCP process executor from configured MCP runtime posture, or preserves the no-op executor when MCP fabric is disabled/refused.
- Turn coordinator accepts an injectable provider tool-call executor and writes provider-origin tool request/result evidence before turn completion when the bridge is supplied.
- Reusable MCP process executor implements the runtime tool executor boundary, executes initialize/initialized handshake when a server process is first spawned, caches one stdio child per server, replaces stale launch specs, records elapsed duration, preemptively terminates blocked reads at timeout, classifies timeout failures, and drops failed processes from the pool.
- Agent-start MCP gate metadata now records the Rust MCP bridge as implemented but withheld from the production runtime slice until live Site MCP execution is admitted.
- MCP runtime config is explicit: Site MCP fabric remains disabled unless `NARADA_AGENT_TUI_ENABLE_MCP_FABRIC` is enabled; process launch MCP config/fabric env reaches `configured` posture only when the MCP config path is lexically inside the declared Site MCP fabric root, readable, parseable by the Rust MCP fabric transport client, and declares at least one valid server with at least one visible tool, while production exposure remains controlled by launch admission gates.
- Agent-start launch env forces `NARADA_AGENT_TUI_ENABLE_MCP_FABRIC=false` for the bounded runtime slice and records that MCP environment gate in launch metadata.
- Transcript projection and store for operator/system input, system directive hold/release, provider output placeholders, provider tool-call placeholders, and terminal turn status.
- Layout, status, composer, transcript, and aggregate app view models, including one runtime posture bundle for disabled/refused/configured provider posture, explicit provider-adapter admission posture, plus disabled/refused/configured MCP and terminal-rendering posture in status output; process env is snapshotted through the library runtime config snapshot boundary before deriving the combined posture.
- Ratatui renderer for transcript/status/composer regions.
- Renderer acceptance verifies nonblank buffer rendering, core region text, stable layout rectangles, and preserved composer draft in compact frames.
- Terminal lifecycle state guard with clean leave semantics after normal exit and render-loop error.
- Terminal input decoding, input tick reduction, composer draft reducer, and render-loop action reducer.
- `tui-textarea` dependency and `TextareaComposer` adapter scaffold with the same submit, clear, interrupt, and draft-state effects as the current reducer.
- Terminal input tick now applies decoded key intents through `TextareaComposer` while preserving the public `ComposerDraftState` and `TerminalInputTickOutcome` bridge.
- Interactive render-loop state now owns a long-lived `TextareaComposer`; runtime and view APIs receive draft snapshots only at their existing boundaries.
- Composer region rendering now uses the `tui-textarea` widget path, with an explicit live-composer render entry point available beside snapshot rendering.
- Terminal interactive draw loop now calls the live-composer renderer so textarea cursor and viewport state are preserved during interactive rendering.
- Terminal runtime config is explicit: terminal rendering remains disabled unless `NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING` is enabled with `NARADA_AGENT_TUI_TERMINAL_MODE=interactive_loop`; CLI acceptance verifies disabled, refused, configured posture, and `--render-once`/`--interactive-loop` refusal while the gate is disabled.
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
- Agent-start launch metadata names the admitted bounded runtime slice, the shared terminal rendering gate for `--render-once` and `--interactive-loop`, the terminal rendering environment gate, and the unsatisfied promotion gate.
- Agent-start launch metadata keeps provider execution disabled and records the missing provider adapter, evidence, streaming, and tool-call contracts required before admission.
- Agent-start launch metadata keeps Site MCP fabric access disabled for the bounded runtime slice and records the implemented-but-withheld Rust MCP bridge plus remaining live Site execution admission requirements.
- Agent-start uses named metadata builders for the shared `agent-tui` terminal, provider, and MCP promotion gates instead of inline ad hoc gate objects.
- Agent-start promotion metadata includes a machine-readable checklist for Rust test availability, terminal-loop acceptance, carrier command acceptance, rendering/diagnostic boundary acceptance, payload-reference policy, provider adapter admission, MCP fabric client admission, Site rollout acceptance, and launch metadata runtime slice evidence; completed checklist items are marked satisfied instead of retained as stale rollout blockers.
- Agent-start launch metadata includes a concrete `site_rollout_acceptance` matrix for all launcher-registry Narada Sites, with per-Site side-by-side agent-cli/agent-tui evidence requirements and default promotion blocked until acceptance is current.
- `tools/agent-start/agent-tui-rollout-acceptance.mjs` builds a non-launching rollout acceptance report from the launch metadata, accepts explicit `--known-site-root site=path` root resolution, accepts per-Site `--agent-cli-evidence site=path` and `--agent-tui-evidence site=path`, validates evidence as complete live authoritative `narada.agent_start.result.v0` launch packets for the expected runtime, `launching` status, `dry_run=false`, `exec=true`, authoritative agent-start and carrier-session records, event/session IDs, carrier-specific session/control paths, bounded `agent-tui` smoke slice, and matching Site root, marks a Site accepted only when both evidence paths are valid for that Site, names unresolved or missing Site roots and missing, incomplete, or invalid side-by-side evidence, and can write `.narada/crew/agent-tui-rollout-acceptance/latest.json`.
- Agent-start launch metadata exposes the `agent-tui` Rust toolchain readiness preflight command, expected blocker, and exit-code semantics.
- Agent-start tests assert production launch does not opt into `--interactive-smoke-loop`, `--persistent-smoke-session`, legacy `--runtime-loop`, or `--max-steps`.

## Promotion Gate

`agent-tui` must stay on the bounded non-terminal runtime launch path until all of these are true:

- Rust tests run in CI or a documented local toolchain with MSVC `link.exe` available.
- `--interactive-smoke-loop --max-steps <n>` passes fixture acceptance for queued operator input, held system directives, release, interrupt, malformed control JSONL, and transcript projection.
- `--interactive-loop --max-steps <n>` has scripted terminal-frame acceptance that verifies no blank frame, stable layout rectangles, preserved composer draft, and clean terminal leave on exit/error.
- Provider dispatch remains explicitly disabled unless a real provider adapter is admitted with its own authority and evidence contract.
- Site MCP access remains explicitly disabled unless a Rust MCP fabric client is admitted with policy-bound tool visibility.
- `agent-start` launch metadata names the runtime slice accurately: smoke step, smoke loop, or terminal interactive loop.
- Production `agent-start -Runtime agent-tui` changes from `--interactive-step-once` only after the above checks are green and the launch packet records terminal rendering as admitted.

## Promotion Gate Gap Audit

Current launch metadata now distinguishes satisfied gates from remaining promotion blockers:

- Satisfied: carrier-local queue commands and literal slash input have parser, runtime coordinator, session evidence, and Rust tests.
- Satisfied: rendering and diagnostic boundaries cover provider stderr, known-noise suppression, payload threshold policy, resize behavior, and stable renderer frames.
- Satisfied: payload reference policy is enforced for large or sensitive provider/tool payloads at transcript boundaries.
- Satisfied: launcher-registry Site rollout has accepted side-by-side `agent-cli` and bounded `agent-tui` evidence for all known Sites.
- Partial: Rust tests pass through the documented VS DevCmd toolchain; plain-shell readiness remains a diagnostic preflight.
- Partial: terminal-loop acceptance has scripted frame, lifecycle, injected-loop, live-composer rendering, and terminal runtime config coverage; real-terminal promotion is blocked on provider admission, MCP admission, and explicit terminal-mode promotion.
- Partial: provider admission has disabled/refused/configured runtime posture, explicit adapter admission evidence, a scripted admitted adapter contract exercised through turn and runtime-step paths, streaming transcript accumulation, and provider-origin tool-call mediation; real production provider dispatch remains withheld.
- Partial: MCP admission has config/fabric posture, policy visibility, request/response framing, supervised stdio execution, runtime-posture evidence, and launch gating; production Site MCP exposure remains withheld until live Site execution is admitted.

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

## Current Verification

Quiet defaults:

```powershell
pnpm agent-tui:test:focused
pnpm agent-tui:test
pnpm --filter @narada2/carrier-protocol test
pnpm agent-start:test
```

Verbose Rust output is intentionally explicit:

```powershell
pnpm agent-tui:test:verbose
Plain non-developer shells may still report blocked:

```powershell
node D:\code\narada\tools\agent-start\check-agent-tui-rust-toolchain.mjs
```

Reason: `link.exe` and Windows SDK libraries are available after `VsDevCmd.bat` loads the developer environment. They may not be visible in ordinary shells; the preflight reports this as `missing_msvc_link_exe_on_path` and `windows_sdk_lib_not_loaded_in_LIB`.

## Rust Toolchain Recovery

Use this diagnostic path before treating agent-tui test failures as implementation failures:

```powershell
where.exe link
```

If that does not find `link.exe`, install or modify Visual Studio Build Tools with the C++ build tools workload. If `link.exe` exists but `gdi32.lib` is missing, install or modify Visual Studio Build Tools to include a Windows SDK.

Readiness command:

```powershell
node D:\code\narada\tools\agent-start\check-agent-tui-rust-toolchain.mjs
```

Agent-start launch results expose the same preflight as `agent_tui_launch.rust_toolchain_readiness`.

Expected quiet verification after recovery:

```powershell
pnpm agent-tui:test
```

If `pnpm agent-tui:test` still fails after `VsDevCmd.bat` reports a ready toolchain, treat the new failure as an `agent-tui` implementation issue instead of a toolchain blocker.


## Next Step

Promote the next blocked carrier capability, not more Site rollout evidence. The launcher-registry rollout gate is accepted for all known Sites. The remaining promotion gates are:

- Provider adapter admission: real production provider dispatch and token streaming over the admitted adapter contract.
- MCP fabric launch admission: Rust-side Site MCP discovery, policy-bound visibility, request/response, evidence, and runtime-config executor construction exist; production Site MCP exposure remains withheld by launcher policy until explicitly admitted.
- Terminal interactive promotion: production `agent-start -Runtime agent-tui` must move from bounded non-terminal smoke to admitted terminal rendering only after provider admission, MCP admission, and explicit terminal-mode promotion are recorded.

## Live Rollout Evidence Commands

Primary bounded collection path:

```powershell
Set-Location D:\code\narada
.\tools\agent-start\Collect-AgentTuiRolloutEvidence.ps1
```

The script verifies all launcher-registry Sites and rewrites the rollout acceptance report. Site roots and seed evidence paths are parameterized, so a moved checkout or newer baseline can be supplied without editing the script. `-RefreshAgentCli` is refused unless paired with `-AllowInteractiveAgentCliRefresh`, because `agent-cli` baseline collection can block at an operator prompt.
