# Narada Agent CLI / NARS

Narada-owned MCP-native agent client and first-slice Narada Agent Runtime Server implementation.

## Modes

- Interactive CLI: human terminal prompt for one Agent identity.
- Programmatic one-shot: `--message` / `--message-file` runs bounded input and exits.
- NARS server mode: `--server` exposes JSONL stdio for machine-addressable multi-turn automation.

Interactive CLI accepts:

- `/help`
- `/status`
- `/model <model-name>`
- `/thinking none|low|medium|high`
- `/exit`

During a running turn it prints elapsed working status. Press `Esc` to request interruption; if a provider call is already in flight, the CLI records the interrupt and stops after that call returns.

Use `--stream` or `--no-stream` to control incremental provider output. Interactive mode defaults to streaming; `--server` mode defaults to non-streaming terminal rendering and emits structured events only. `NARADA_AGENT_CLI_STREAM=1|0` provides the same default as an environment variable.

Use `--color` or `--no-color` to control ANSI terminal color. Interactive mode enables color when stdout is a TTY; `NO_COLOR` disables it unless `--color` is explicit. Assistant, tool, progress, and prompt output use light paragraph spacing for readability. Server mode remains protocol-only JSONL on stdout.

For `codex-subscription`, the default transport is `codex exec --json`. With streaming enabled, the CLI renders Codex JSONL assistant events as they arrive. With `--no-stream`, it buffers JSONL events and prints the final assistant message at turn completion. Current Codex JSONL emits completed assistant-message events, not token deltas; if Codex adds token delta events, this transport is the place to surface them. Set `NARADA_CODEX_SUBSCRIPTION_TRANSPORT=mcp-server` to use the older request/response MCP transport.

Narada proper admits both runtime names:

- `agent-cli` for the interactive CLI carrier.
- `nars` for the JSONL stdio server carrier.

Both use `tools/agent-cli/agent-cli.mjs`; `nars` adds `--server`.

Model and thinking defaults can be supplied at launch:

```powershell
node tools/agent-cli/agent-cli.mjs --identity narada.architect --model gpt-5.5 --thinking high
```

Environment defaults:

- `NARADA_AI_MODEL`
- `NARADA_AI_THINKING`
- `NARADA_THINKING_LEVEL`
- `NARADA_AGENT_CLI_STREAM`
- `NARADA_AGENT_CLI_COLOR`

## NARS Server Mode

```powershell
node tools/agent-cli/agent-cli.mjs --server --identity narada.architect --session carrier_session_example
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

Provider metadata lives in `tools/agent-cli/intelligence-providers.json`.

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

NARS does not inject User Site MCP servers. Model-selected tool calls are requests routed through the declared MCP fabric, not authority by themselves.

In `--server` mode, only tools classified read-only execute automatically. Other MCP tool calls return `action_admission_required` / `admission_required` events and are not executed by the NARS process. A separate admission layer must convert a requested effect into an authorized MCP action.
