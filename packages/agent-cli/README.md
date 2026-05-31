# Narada Agent CLI / Agent Runtime Server

Narada-owned MCP-native agent client and first-slice Narada Agent Runtime Server implementation.

## Package Authority

`@narada2/agent-cli` is the canonical Narada agent-cli implementation.

Canonical binary and provider metadata contract:

```text
package: @narada2/agent-cli
bin:     narada-agent-cli
bin:     agent-runtime-server
export:  ./intelligence-providers
export:  ./windows-wrapper-template
```

Registered Site launchers and Windows wrappers must call the packaged binary.
They must not recreate `tools\agent-cli`, fork provider metadata, or maintain
Site-local carrier behavior. Site-local launch code is a shim for identity,
session, Site root, MCP fabric path, and operator affordances only.

Launchers should resolve the carrier through the package contract:
```text
package: @narada2/agent-cli
bin:     narada-agent-cli
bin:     agent-runtime-server
export:  ./intelligence-providers
```

`NARADA_PROPER_ROOT` is a local workspace fallback for finding that package
root. It is not permission to import `packages/agent-cli/src/...` or
`packages/agent-cli/bin/...` directly from launcher code.

The standard Windows wrapper is also package-owned. Registered Sites should
materialize `Start-AgentCliSession.ps1` from package export
`@narada2/agent-cli ./windows-wrapper-template`. Generated copies carry:

```text
narada_template_id:      narada.agent_cli.windows_wrapper
narada_template_version: 2
narada_template_hash:    <sha256 of normalized template>
```

The hash makes wrapper drift mechanically detectable. Local launcher code may
render or reconcile that wrapper, but it must not hand-maintain a divergent
carrier implementation.

## Modes

- Interactive CLI: human terminal prompt for one Agent identity.
- Programmatic one-shot: `--message` / `--message-file` runs bounded input and exits.
- Agent Runtime Server mode: `--server` exposes JSONL stdio for machine-addressable multi-turn automation.

Interactive CLI accepts:

- `/help`
- `/status`
- `/model <model-name>`
- `/thinking none|low|medium|high`
- `/clear`
- `/exit`

The interactive prompt is `operator -> <agent>` followed by `>` while waiting for input. After submission, the visible transcript line is rewritten as `operator -> <agent>: <message>`, making the operator the speaker and the agent identity the target.
Slash command output is rendered as `agent-cli:` because it comes from the carrier CLI, not the agent model.
Programmatic inputs can be marked with `--operator-directive` or `--system-directive`; in interactive display they render as `operator directive -> <agent>:` or `system directive:` with distinct label colors.
Interactive mode does not schedule startup system directives by default. Use `--enable-startup-system-directive` to schedule the default `run startup sequence` directive after 10 seconds, or `--startup-system-directive <text>` and `--startup-system-directive-delay-ms <ms>` to opt in with custom content/timing. `NARADA_AGENT_CLI_STARTUP_SYSTEM_DIRECTIVE_ENABLE=1` provides the same opt-in as an environment default.
Tool mediation renders as `<agent> -> agent-cli:` for requested tool calls and `agent-cli -> <agent>:` for returned results.

During a running turn it prints a spinner with elapsed time and the active phase, such as `thinking` or `calling agent_context_startup_sequence`. Press `Esc` to request interruption. The CLI aborts the current provider request when the active transport supports cancellation; for `codex-subscription` over `codex exec --json`, it terminates the child process and marks the turn interrupted. Tool calls print lifecycle summaries with status and duration.

Use `--stream` or `--no-stream` to control incremental provider output. Interactive mode defaults to streaming; `--server` mode defaults to non-streaming terminal rendering and emits structured events only. `NARADA_AGENT_CLI_STREAM=1|0` provides the same default as an environment variable.

Use `--color` or `--no-color` to control ANSI terminal color. Interactive mode enables color when stdout is a TTY; `NO_COLOR` disables it unless `--color` is explicit. Operator input, agent output, tool, progress, and prompt output use `label:` message blocks, light paragraph spacing, terminal-width wrapping, basic markdown rendering, and compact JSON tool summaries. Server mode remains protocol-only JSONL on stdout.

For `codex-subscription`, the default transport is `codex exec --json`. With streaming enabled, the CLI renders Codex JSONL model events as agent output as they arrive. With `--no-stream`, it buffers JSONL events and prints the final agent message at turn completion. Current Codex JSONL emits completed assistant-message events, not token deltas; if Codex adds token delta events, this transport is the place to surface them. Set `NARADA_CODEX_SUBSCRIPTION_TRANSPORT=mcp-server` to use the older request/response MCP transport.

Narada proper admits these runtime names:

- `agent-cli` for the interactive CLI carrier.
- `agent-runtime-server` for the JSONL stdio server carrier.
- `nars` as a legacy input alias for `agent-runtime-server` while old launch records still exist.

Both canonical runtimes use the packaged `@narada2/agent-cli` bins: `narada-agent-cli` for interactive mode and `agent-runtime-server` for server mode. The implementation lives in `packages/agent-cli/src/agent-cli.mjs`.

Interactive `agent-cli` also admits a structured sideband control file when
launched with `--control-jsonl <path>`. System directive delivery must append
JSONL frames such as `{"method":"system_directive.deliver",...}` to that file;
do not paste directive frames into the operator stdin stream. Agent Runtime Server receives the
same directive method over its existing JSONL stdio protocol.

When launched by `narada.ps1 agent-start`, interactive `agent-cli` is registered
with a Site-local `control_path` under
`.narada\crew\nars-sessions\<carrier_session_id>\control.jsonl`. That sideband is
the programmatic control transport; terminal stdin remains the operator text
surface. The sideband is deliberately line-oriented JSONL rather than pasted
terminal text so operator input, system directives, and slash commands keep
separate provenance.

Both `agent-cli` and `agent-runtime-server` normalize terminal input, programmatic input, server
JSONL messages, and delivered system directives into one internal input queue
before the model turn. Slash commands are carrier-local and do not enter that
queue. If the operator has non-whitespace text in the interactive prompt,
delivered system directives remain queued and the CLI reports the waiting count;
empty or whitespace-only prompts do not block system directives.

When a system directive enters the carrier turn queue, the carrier records
`narada.directive.carrier_receipt_evidence.v1` in the session evidence. Agent Runtime Server also
emits a `directive_receipt_recorded` protocol event. This receipt means the
carrier accepted the directive into its conversation loop; it does not mean the
agent completed the referenced work, claimed a task, or executed the directive
content.

Model and thinking defaults can be supplied at launch:

```powershell
narada-agent-cli --identity narada.architect --model gpt-5.5 --thinking high
```

Environment defaults:

- `NARADA_AI_MODEL`
- `NARADA_AI_THINKING`
- `NARADA_THINKING_LEVEL`
- `NARADA_AGENT_CLI_STREAM`
- `NARADA_AGENT_CLI_COLOR`

## Agent Runtime Server Mode

```powershell
agent-runtime-server --identity narada.architect --session carrier_session_example
```

Requests are one JSON object per stdin line. Events are one JSON object per stdout line. In `--server` mode stdout is protocol-only; diagnostics go to stderr.

Minimum requests:

```json
{"id":"req-1","method":"session.status","params":{}}
{"id":"req-2","method":"conversation.send","params":{"message":"run startup sequence"}}
{"id":"req-3","method":"conversation.interrupt","params":{}}
{"id":"req-4","method":"session.close","params":{}}
```

Session evidence is stored under:

```text
<siteRoot>\.narada\crew\nars-sessions\<session_id>\
```

## Provider Posture

Provider metadata is exported as `@narada2/agent-cli ./intelligence-providers`.

Supported first-slice providers:

- `codex-subscription`
- `openai-api`
- `kimi-api`
- `anthropic-api`

Vendor providers are cognition adapters. They do not own Narada session identity, tool admission, mutation authority, or confirmation.

## MCP Posture

The client discovers target Site MCP config from:

```text
<siteRoot>\.ai\mcp\*.json
```

Agent Runtime Server does not inject User Site MCP servers. Model-selected tool calls are requests routed through the declared MCP fabric, not authority by themselves.

In `--server` mode, only tools classified read-only execute automatically. Other MCP tool calls return `action_admission_required` / `admission_required` events and are not executed by the Agent Runtime Server process. A separate admission layer must convert a requested effect into an authorized MCP action.

## Launch Invariants

The standard Windows interactive wrapper is `Start-AgentCliSession.ps1`. It may
resolve launch context and call the packaged binary, but it must not own provider
resolution or carrier behavior. It is generated from
`@narada2/agent-cli ./windows-wrapper-template`; local edits should be made in
the package template and reconciled into Sites.

Workspace dry-run is non-executing. `Start-NaradaWorkspace.ps1 -DryRun` must not
open Windows Terminal, start carrier sessions, or wait for operator input; its
result must report `windows_terminal_invoked: false`.

Verification for carrier launch changes:

```powershell
pnpm --filter @narada2/agent-cli test
pnpm --filter @narada2/agent-cli typecheck
pwsh -NoProfile -File C:\Users\Andrey\Narada\tools\agent-start\Test-AgentCliPackageCutover.ps1
```
