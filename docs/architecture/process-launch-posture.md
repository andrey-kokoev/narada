# Process Launch Posture Target

This document defines the target posture for OS process launch inside Narada proper.

Process launch is an execution-host concern. It is adjacent to, but not the same as, carrier runtime semantics, command-execution authority, or operator-surface presentation. Use [`Carrier Runtime Contract`](carrier-runtime-contract.md) for carrier/session meaning, [`Carrier Taxonomy`](../concepts/carrier-taxonomy.md) for carrier vocabulary, [`Command Execution Intent Zone`](../concepts/command-execution-intent-zone.md) for governed command execution, and [`Narada MCP Facade`](../concepts/narada-mcp-facade.md#runtime-locus-policy) for runtime-locus policy.

## Problem

Narada currently has several legitimate reasons to start child processes:

- open an operator terminal;
- open a browser projection;
- run a provider adapter such as Codex subscription;
- run MCP servers;
- run governed commands;
- run tests and probes;
- start rare elevated or credential-entry flows.

When these launch sites use raw APIs directly, visibility and ownership become accidental. A background browser opener may flash `cmd.exe`; a provider adapter may surface `node.exe`; a test helper may inherit a visible console; a runtime helper may outlive its owner. These are not feature failures in one surface. They are missing process-launch posture.

## Target

Every process launch in Narada proper must declare one process-launch posture and must go through a posture-owned launcher or an explicitly admitted exception.

The posture answers:

```text
Why is this process being started, who is supposed to see it, who owns its lifecycle, how are its streams handled, and what evidence/admission boundary receives the result?
```

Raw process APIs such as `spawn`, `spawnSync`, `execFile`, `exec`, PowerShell `Start-Process`, `cmd.exe /c start`, `open`, and `xdg-open` should not appear in product code outside posture-owned wrappers. Tests may use raw APIs only through test helpers or explicit `test_child` annotations.

## Posture Enum

| Posture | Meaning | Visibility | Lifecycle owner | Required defaults |
| --- | --- | --- | --- | --- |
| `operator_terminal` | Start an intentional human-facing terminal or operator surface process. | Visible by design. | Launcher or operator-surface owner. | Stable title/working directory; no hidden helper surprise; dry-run must not launch. |
| `browser_open` | Ask the OS to open a URL or file in the default browser. | Browser visible; helper console hidden. | Calling CLI/surface until open request is handed off. | `windowsHide: true` for helper process; detached/ignored stdio; bounded error reporting. |
| `provider_subprocess` | Run a model/provider CLI or adapter child such as Codex subscription or Kimi. | Hidden. | Carrier runtime/provider adapter. | Piped stdio as needed; `windowsHide: true`; cancellation kills process tree; provider stderr bounded. |
| `mcp_server` | Start an MCP server child process. | Hidden. | MCP fabric or carrier runtime. | Piped stdio; `windowsHide: true`; health/startup failure captured; owner stops child tree. |
| `governed_command_execution` | Run an admitted command under CEIZ or a structured command surface. | Hidden by default; visible only by explicit operator-terminal authority. | Command execution controller. | Structured argv, cwd, timeout, env policy, output admission, result evidence. |
| `test_child` | Start a child process from tests or verification probes. | Hidden by default. | Test helper. | Timeout; cleanup; hidden windows on Windows; visible only with explicit fixture reason. |
| `elevated_or_operator_prompt` | Start a process that must show a system prompt, UAC prompt, credential prompt, or equivalent. | Visible by design. | Prompting command owner. | Explicit reason, bounded follow-up, no use as generic background launcher. |

This enum is intentionally small. New posture names require architecture review because each new name creates another admissible process-launch semantics class.

## Ownership Boundary

Narada proper owns the shared process-launch posture contract because the recurring launch helpers live across Narada packages:

- `packages/layers/cli` for launcher, browser projections, and command helpers;
- `packages/agent-runtime-server` and `packages/carrier-runtime` for carrier/provider subprocesses;
- `packages/mcp-fabric` for MCP child processes;
- `packages/agent-start` for launch preflight and compatibility paths;
- test helpers under package-local `test` directories.

User Sites and product Sites may configure which surfaces, providers, tools, or roots are admitted. They should not redefine whether a background provider subprocess may open a visible console. That behavior belongs to this posture contract and the execution-machine Site/runtime implementation that launches the process.

## Wrapper Target

Narada should provide one small process-launch posture module or package with named wrappers. The exact package name is implementation detail, but the API shape should make posture visible at the call site.

Target wrapper families:

```ts
startOperatorTerminal(...)
openBrowserUrl(...)
spawnProviderSubprocess(...)
spawnMcpServer(...)
runGovernedCommand(...)
spawnTestChild(...)
startElevatedOrOperatorPrompt(...)
```

Wrappers must set platform-specific defaults centrally. On Windows, every non-visible posture must hide helper windows. A caller should not have to remember `windowsHide: true` at each site.

Wrappers must also make stream posture explicit:

- `pipe`: caller consumes stdout/stderr;
- `ignore`: helper has no meaningful stream contract;
- `inherit`: only admitted for visible operator processes or explicit debug/test fixtures.

## Agent Runtime Start Posture

Starting `narada-agent-runtime-server` is not an operator-terminal action just because an operator surface requested it. The runtime host is a background authority process; the operator surface is a projection or client that may attach to it. Hidden runtime start selection must therefore be based on runtime semantics, not on carrier or operator-surface names.

Default rule:

```text
runtime == "narada-agent-runtime-server"
exec == true
wait != true
no explicit visible_runtime_terminal request
=> agent_start_execution_mode = "hidden_detached"
```

This rule must hold regardless of whether the caller spells the presentation side as `agent-cli`, `agent-web-ui`, a compatibility `carrier` value, or a future operator-surface identifier. Carrier/operator-surface naming may affect projection behavior; it must not decide whether the runtime host is hidden or visible.

Allowed execution modes:

| Mode | Meaning | Visibility |
| --- | --- | --- |
| `hidden_detached` | Runtime host is spawned through the hidden posture helper, detached from the launching terminal, with stdout/stderr routed to owned files or structured artifacts. | Hidden. |
| `visible_inherited` | Runtime start intentionally inherits an operator-visible terminal. | Visible by explicit request only. |
| `sync` | Caller waits for runtime start completion as a foreground command, typically for dry-run, tests, or blocking diagnostics. | Caller-owned; not a background runtime posture. |

Fallback to `visible_inherited` requires an explicit reason such as `visible_runtime_terminal`, `wait == true`, or a test/debug fixture. It is not an acceptable fallback merely because the operator-surface name is unknown. A visible FNM `node.exe`, `cmd.exe`, `pwsh.exe`, or equivalent helper window during `narada-agent-runtime-server --exec` startup is a posture violation unless that explicit visible-runtime request is present in the launch evidence.

Runtime-start launch results should record:

- `agent_start_execution_mode`: `hidden_detached`, `visible_inherited`, or `sync`;
- `detach_decision`: structured selected/blocked decision for hidden detach;
- `detach_refusal_reasons`: empty when hidden detach is selected, otherwise the concrete reasons;
- runtime, operator surface, `exec`, `wait`, and visible-terminal request inputs used by the decision;
- hidden launch output locations when `hidden_detached` is selected.

Workspace launch has the same obligation at its own handoff boundary. A workspace plan that selects a NARS runtime start must expose `runtime_start_execution_mode`, `runtime_start_command`, and `runtime_start_cwd`. When every selected runtime start is `hidden_detached`, the workspace launcher must start those runtime hosts through the hidden process posture directly; it must not wrap the hidden start in Windows Terminal, `pwsh -NoExit`, `cmd.exe`, or another visible operator terminal. Compatibility `wt_args` may remain in dry-run or transitional plan output for non-hidden projections, but it is not the authoritative execution path for hidden NARS runtime starts.

Workspace launch results should therefore distinguish:

- `windows_terminal_invoked: false` and `hidden_runtime_invoked: true` for hidden NARS runtime handoff;
- `hidden_runtime_launches` with redacted posture diagnostics for each hidden runtime host;
- handoff posture `hidden_runtime_host` instead of `operator_terminal` when no operator terminal was launched.

Workspace launch evidence must satisfy these mechanical constraints:

- `workspaceLaunchCommand` returns `schema: narada.workspace_launch.launch_result.v1` for executed launches; planning remains `narada.workspace_launch.plan.v1`.
- If `--result-path` is supplied, the persisted JSON artifact must be structurally equal to the returned launch result after final status, mode, and invocation posture fields are applied.
- `mode: launch` implies `status: launched` and `mutation_performed: true`; `status: planned` must never survive in a launch result.
- For a single runtime handoff, `windows_terminal_invoked` and `hidden_runtime_invoked` are mutually exclusive. Hidden runtime launches require all selected runtime starts to carry `runtime_start_execution_mode: hidden_detached`.
- Executed launch results use `launch_agents` as the canonical launched-agent list. Transitional `selected_agents` may remain only with `selected_agents_authority: compatibility_plan_selection`.
- Compatibility terminal argv must live under `legacy_terminal_plan` with `authority: compatibility_non_authoritative`; executed launch results must not expose top-level `wt_args`. Consumers must use `runtime_start_execution_mode` and `runtime_start_command` for execution posture.
- `NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG` and `NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG` are test-only capture hooks for proving branch selection without starting real long-lived runtime processes. They are not product configuration knobs.

Regression coverage should include a Site launch such as `smart-scheduling.resident` with `runtime = narada-agent-runtime-server`, `exec = true`, and `wait = false`, proving hidden-detached selection independent of operator-surface naming.

The host-wrapper verification command is:

```powershell
pnpm run narada:verify-workspace-launch-hidden-runtime
```

It exercises `Start-NaradaWorkspace.ps1` with the test-only capture hooks and fails unless the materialized result artifact reports `schema: narada.workspace_launch.launch_result.v1`, `status: launched`, `mode: launch`, `windows_terminal_invoked: false`, and `hidden_runtime_invoked: true`.

## Operator Projection Open Request

`browser_open` needs a semantic request layer above `openBrowserUrl(...)`. The target first-class object is `OperatorProjectionOpenRequest`.

It exists because opening a browser, file viewer, dashboard, or artifact view is an operator-visible projection side effect. The URL or artifact is not merely output, and launching the default browser is not a domain-command implementation detail. A command that wants to show something to the operator must create an open request, receive an admission/suppression/refusal decision, and only then hand off to the posture-owned executor.

This object is parallel to, but not symmetrical with, `AiProcessInvocation`: both are invocation-path choke points for side effects that should not be hidden inside domain commands, but `AiProcessInvocation` governs AI runtime process creation and lifecycle while `OperatorProjectionOpenRequest` governs a short visible projection handoff.

Target shape:

```json
{
  "schema": "narada.operator_projection_open_request.v1",
  "projection_kind": "browser_url",
  "target_ref": "http://127.0.0.1:9999/",
  "purpose": "operator_projection",
  "caller": {
    "package": "@narada2/cli",
    "command": "agent-web-ui attach"
  },
  "mode": "execute",
  "policy": {
    "allow_visible_host_effect": true
  }
}
```

Initial `projection_kind` values should cover `browser_url`, `artifact_view`, `dashboard`, `file_view`, and `auth_flow`. Initial outcomes should include `planned`, `admitted`, `opened`, `suppressed`, `refused`, and `failed`. Suppression is not failure: dry-run, test, headless, and operator policy can all intentionally suppress the host UI effect while preserving the request as evidence.

Rules:

- Domain commands should not call `openBrowserUrl(...)` directly.
- Domain commands should create `OperatorProjectionOpenRequest` and render or persist the outcome.
- Tests should assert the request/outcome and inject a non-opening executor unless a fixture explicitly tests visible host behavior.
- Dry-run and headless execution should default to `planned` or `suppressed`, never to a real host UI open.
- Suppressed outcomes with a concrete `target_ref` should be rendered with manual-open guidance: show the URL or artifact path the operator can open themselves, and make clear no host UI was launched.
- Planned outcomes whose target is not known yet should carry `target_ref: null` plus a resolution note from the caller.
- `openBrowserUrl(...)` remains the low-level executor for admitted `browser_url` requests.

The substrate lives in `@narada2/process-launch-posture` as `createOperatorProjectionOpenRequest`, `admitOperatorProjectionOpenRequest`, and `executeOperatorProjectionOpenRequest`. Current CLI integrations route `agent-web-ui attach` and task graph browser-render opens through this substrate, and launcher plans expose planned `operator_projection_open_requests` for `agent-web-ui` projections whose URL is resolved at attach time.

The request belongs in process-launch posture because it admits the visible host effect. Its semantic placement in the runtime graph is documented in [`Narada Runtime Projection Graph`](../concepts/narada-runtime-projection-graph.md#operator-projection-open-requests).

## Guard Target

A repository guard should mechanically enforce this contract.

The guard should fail when product code uses raw launch APIs outside approved wrapper modules. It should report file, line, detected API, inferred risk, and the required remediation.

The guard should recognize at least:

- JavaScript/TypeScript `child_process` launch APIs;
- PowerShell `Start-Process`;
- direct `cmd.exe /c start`, `open`, and `xdg-open` browser helpers;
- wrapper bypasses in scripts under `packages`, `tools`, and `scripts`.

The guard may allow temporary annotations or a checked migration baseline during migration:

```ts
// narada-process-launch-posture: provider_subprocess
// reason: runs Codex subscription adapter under carrier runtime ownership.
```

A migration baseline records existing raw launch sites as explicit debt so new raw launch sites fail immediately. Annotations and baseline entries are migration aids, not the target steady state. High-risk postures should move to wrappers first: `browser_open`, `provider_subprocess`, `mcp_server`, and `operator_terminal`.

## Windows Visibility Invariants

Windows visibility is part of the contract because Narada is heavily used from Windows operator surfaces.

Required invariants:

- `browser_open` may open the browser, but the helper process must not flash a console window.
- `provider_subprocess` must not show `node.exe`, `pwsh.exe`, `codex.exe`, or equivalent helper windows during a model turn.
- `mcp_server` must not show server child windows.
- `test_child` must not show windows unless the fixture explicitly tests visible behavior.
- `operator_terminal` and `elevated_or_operator_prompt` are the only ordinary visible launch postures.

A visible helper window is a posture violation even when the launched work succeeds.

## Evidence And Diagnostics

Process-launch wrappers should return enough structured information to diagnose posture failures without dumping raw implementation details into operator chat.

For launch attempts, capture:

- posture;
- command display label or redacted argv;
- cwd;
- owner package or component;
- visibility posture;
- stream posture;
- process id when available;
- startup error or exit status when relevant;
- timeout/cancellation result for owned children.

Operator-facing surfaces should render concise status. Detailed argv, stderr, and platform diagnostics belong in structured diagnostics or artifacts.

## Migration Plan

1. Add the process-launch posture wrapper module.
2. Keep `OperatorProjectionOpenRequest` as the admission/suppression layer above `openBrowserUrl`.
3. Move any remaining browser-open helpers to `openBrowserUrl` through `OperatorProjectionOpenRequest` first.
4. Move provider subprocess launch to `spawnProviderSubprocess` while preserving current owned-process tree cancellation.
5. Move MCP server launch to `spawnMcpServer` or annotate it until the fabric wrapper exists.
6. Move launcher Windows Terminal starts to `startOperatorTerminal`.
7. Add `spawnTestChild` and migrate package test helpers.
8. Add the repository guard in report mode.
9. Burn down annotations until the guard can fail by default in verification.

## Current Known Risk Classes

Current code inspection found these risk classes:

- browser-open helpers that use raw `cmd.exe /c start`;
- provider subprocess paths that correctly intend hidden launch but still need wrapper-level enforcement;
- MCP server spawns distributed across runtime/fabric code;
- command execution helpers and backup/restore scripts using raw subprocess APIs;
- numerous tests with raw process helpers.

The observed `cmd`/FNM `node.exe` popup class is exactly what this contract is meant to prevent. The fix is not only a local `windowsHide` patch; the durable fix is that launch visibility becomes a checked posture property.

## Non-Goals

This contract does not decide whether a command is authorized. CEIZ and Site policy decide that.

This contract does not define carrier protocol or session semantics. The carrier runtime contract decides that.

This contract does not require every launch to be hidden. It requires visible launch to be explicit and owned.

This contract does not make User Sites or product Sites responsible for patching Narada proper launch behavior. Sites configure admitted capabilities; Narada proper supplies coherent launch mechanics.
