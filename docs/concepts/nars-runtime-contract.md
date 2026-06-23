# NARS Runtime Contract

## Purpose

This document defines the implementation-facing shape of the Narada Agent Runtime Server (NARS).

The concept document [`narada-agent-runtime-server.md`](narada-agent-runtime-server.md) defines what NARS is. This document defines the contract implementation code should converge on: package ownership, launch boundary, session protocol, event shape, carrier adapter boundary, and verification expectations.

NARS is the Narada-owned runtime server contract for durable, machine-addressable agent sessions. It is not a synonym for Codex, `agent-cli`, a terminal, a transcript, or a model SDK.

## Package Authority

Canonical package:

```text
@narada2/agent-runtime-server
```

Canonical binary:

```text
narada-agent-runtime-server
```

Compatibility alias:

```text
agent-runtime-server
```

The alias exists for compatibility only. New launcher, worker, wrapper, and documentation paths should resolve `narada-agent-runtime-server` from `@narada2/agent-runtime-server`.

The current package may delegate execution to `@narada2/agent-cli`, but the stable runtime-server entrypoint belongs to `@narada2/agent-runtime-server`.

## Layer Shape

NARS sits below launcher planning and above provider-specific carrier execution:

```text
operator / automation caller
  -> launcher or worker planner
  -> agent-start launch materializer
  -> NARS entrypoint
  -> carrier substrate adapter
  -> provider/model adapter
  -> governed MCP/tool surfaces
```

Load-bearing boundaries:

| Layer | Owns | Does not own |
| --- | --- | --- |
| Launcher planner | Selecting agents, Sites, runtime choice, and launch packet validation. | Provider execution, conversation state, tool execution. |
| `@narada2/agent-start` | Identity/session/event creation, Site MCP fabric validation, provider selection, credential projection, launch result materialization. | Runtime protocol, slash command semantics, provider turn loop. |
| `@narada2/agent-runtime-server` | Stable machine-addressable session entrypoint, protocol projection, session handoff, carrier-server wrapper. | Provider credentials, task truth, external effect authority. |
| Carrier substrate, currently `@narada2/agent-cli` | MCP client, provider turn loop, operator projection, session operations, slash-command execution. | NARS package authority or launcher planning. |
| Authority MCP surfaces | Admitted mutations and authoritative facts. | Model judgment or carrier convenience. |

## Session Binding

A NARS process is bound to exactly one Agent Session unless an explicit future supervisor contract says otherwise.

Required launch inputs:

| Input | Meaning |
| --- | --- |
| `--identity` | Durable Narada agent id, for example `sonar.resident`. |
| `--session` | Durable carrier/session id, for example `carrier_...`. |
| `--site-root` | Site root whose MCP fabric and authority surfaces are mounted. |
| provider/model env | Already resolved by `agent-start`; NARS consumes, not discovers, provider selection. |

Required runtime environment, when available:

| Variable | Meaning |
| --- | --- |
| `NARADA_AGENT_ID` | Bound durable agent id. |
| `NARADA_AGENT_START_EVENT_ID` | Launch event id produced by `agent-start`. |
| `NARADA_CARRIER_SESSION_ID` | Bound carrier/session id. |
| `NARADA_SITE_ROOT` | Site root for mounted authority surfaces. |
| `NARADA_WORKSPACE_ROOT` | Workspace root for the session. |
| `NARADA_INTELLIGENCE_PROVIDER` | Resolved provider id. |
| `NARADA_AI_MODEL` | Resolved model id. |

NARS must not silently substitute a different Site, identity, or MCP fabric from ambient user config. If binding data is absent or contradictory, the runtime should fail before accepting operator or automation turns.

## Protocol Shape

The stable protocol is a request/event contract. The transport may be JSONL stdio, named pipe, local HTTP, WebSocket, or another local transport.

Minimum request methods:

| Method | Purpose |
| --- | --- |
| `conversation.send` | Submit one operator/automation turn and run until terminal state. |
| `conversation.interrupt` | Request bounded interruption of an active turn. |
| `session.status` | Inspect identity, readiness, active turn, MCP posture, and blockers. |
| `session.resume` | Reattach to an existing session handle. |
| `session.close` | Close or hand off a session with terminal evidence. |
| `command.execute` | Execute a slash/operator command through the carrier command contract. |

Human terminal input is not raw JSONL. A terminal attached to NARS is a projection of the protocol: ordinary lines become `conversation.send`, slash commands become `command.execute`, and status/help affordances render from runtime state.

## Event Shape

NARS emits structured events that are sufficient to reconstruct a turn without making the transcript authoritative.

Minimum event families:

| Event | Meaning |
| --- | --- |
| `session_started` | Runtime accepted launch binding and exposed a session handle. |
| `session_status` | Current session readiness and operational posture. |
| `directive_received` | A machine/operator turn was accepted for processing. |
| `turn_started` | Provider/carrier loop began for one directive. |
| `assistant_message` | Agent-visible response content. |
| `tool_call` | A tool call was requested. |
| `tool_result` | A tool call completed, failed, or was refused. |
| `command_result` | Slash/operator command completed. |
| `turn_complete` | Directive reached a terminal state. |
| `runtime_error` | Runtime-level fault, not ordinary tool failure. |
| `session_closed` | Session ended or handed off. |

Events should include stable identity fields whenever possible:

```json
{
  "event": "turn_started",
  "agent_id": "sonar.resident",
  "session_id": "carrier_...",
  "request_id": "input_...",
  "timestamp": "2026-06-23T00:00:00.000Z"
}
```

Tool events must preserve the distinction between request, admission/refusal, execution attempt, result, and external confirmation. A successful tool call is not itself authority or confirmation.

## Command Contract

Slash and operator commands are runtime commands, not provider prompts.

Examples:

```text
/help
/status
/recovery
/ops
/exit
```

The command vocabulary should be sourced from `@narada2/carrier-command-contract`. Projected terminal input, help text, and server-side command dispatch should share that contract. If a command is not implemented in a projected runtime, it should fail as an unsupported command with a runtime event, not be sent to the model as ordinary user text.

## Carrier Adapter Boundary

NARS is vendor-neutral. Carrier substrates are replaceable adapters behind the NARS contract.

Current carrier substrate:

```text
@narada2/agent-cli server substrate
```

Allowed adapter responsibilities:

- start or attach the provider turn loop;
- load the Site MCP fabric passed by launch materialization;
- execute provider turns;
- emit normalized session and turn events;
- render a human terminal projection when requested;
- expose session operations needed by automation and observers.

Forbidden adapter ownership:

- choosing Site root from ambient Codex/global config;
- choosing provider defaults outside launch materialization;
- owning the stable NARS binary name;
- treating vendor SDK permission state as Narada authority;
- converting slash commands into model prompts;
- mutating task/mail/outbox state without the relevant MCP authority surface.

## Worker Delegation Shape

Delegated workers that need a durable Narada-bound agent session should target NARS explicitly:

```json
{
  "runtime": "narada-agent-runtime-server",
  "site_root": "D:/code/narada.sonar",
  "provider": "codex-subscription"
}
```

Workers may still use direct vendor runtimes for low-risk read-only research or external comparison, but that is not a Narada-bound runtime session. If the worker must use Site MCPs, preserve Narada identity, report lifecycle evidence, or continue across turns, NARS is the coherent target.

Worker delegation should pass a work order that includes:

- objective and non-goals;
- Site root and allowed repositories;
- authority level;
- required MCP surfaces;
- verification budget;
- exit interview requirement;
- commit/push gates, when applicable.

## State Ownership

NARS owns runtime session state only:

- launch/session evidence;
- request and turn event traces;
- current readiness/posture;
- conversation context or references;
- carrier adapter metadata;
- resume and closeout handles.

NARS does not own:

- task lifecycle truth;
- inbox/mailbox admission;
- outbox/send authority;
- external effect confirmation;
- Site law or capability grants;
- durable product facts owned by another authority locus.

When it needs those objects, it must use the declared MCP/authority surface and emit crossing evidence.

## Failure Policy

NARS should fail early for binding and authority defects:

| Failure | Expected behavior |
| --- | --- |
| Missing `NARADA_AGENT_START_EVENT_ID` when required by startup hydration | Report binding failure before accepting meaningful work. |
| Site MCP fabric mismatch | Refuse launch or report unhealthy MCP posture. |
| Noncanonical MCP server prefix for a Site-bound launch | Refuse during temporary leak-identification gate until the permanent invariant replaces it. |
| Missing provider credential | Fail provider preflight with provider-specific error and no secret disclosure. |
| Unsupported slash command | Render unsupported command; do not send to model. |
| Carrier substrate crash | Emit runtime error and preserve session/event files for recovery. |

## Verification

Package-local checks:

```powershell
pnpm --filter @narada2/agent-runtime-server test
pnpm --filter @narada2/agent-cli test
pnpm --filter @narada2/agent-start test
```

Launcher/fleet checks:

```powershell
pwsh -NoProfile -File C:\Users\Andrey\Narada\tools\agent-start\Test-AgentStartCoherence.ps1
```

Expected coverage:

- package exports and binary ownership for `@narada2/agent-runtime-server`;
- `agent-start` resolves `narada-agent-runtime-server` from the package bin;
- startup event id and session id propagate to the runtime server boundary;
- Site MCP fabric is isolated from global/user Codex config;
- projected terminal input maps ordinary text, slash commands, and JSON frames correctly;
- command help/dispatch comes from a shared command contract;
- provider credentials are projected and redacted by launch materialization, not by generated wrappers.

## Current Convergence Work

Known convergence arrows from the current implementation:

- keep moving runtime-specific launch branches out of `narada-agent-start.ts` into carrier launch adapters;
- keep moving provider and credential logic into focused `agent-start` modules;
- make `@narada2/carrier-command-contract` the single source for command parser/help/dispatch metadata;
- keep `@narada2/agent-runtime-server` as the package authority even while it delegates to `@narada2/agent-cli`;
- make delegated workers that require Narada-bound Site MCP state use NARS instead of raw vendor runtimes;
- document and test NARS as the stable session protocol, not as the current `agent-cli` implementation detail.
