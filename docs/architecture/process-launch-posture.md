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
2. Move known browser-open helpers to `openBrowserUrl` first.
3. Move provider subprocess launch to `spawnProviderSubprocess` while preserving current owned-process tree cancellation.
4. Move MCP server launch to `spawnMcpServer` or annotate it until the fabric wrapper exists.
5. Move launcher Windows Terminal starts to `startOperatorTerminal`.
6. Add `spawnTestChild` and migrate package test helpers.
7. Add the repository guard in report mode.
8. Burn down annotations until the guard can fail by default in verification.

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
