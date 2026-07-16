# Workspace Launch Enforcement Contract

This document is the implementation map for the workspace launcher. It turns the
launcher target shape into mechanically checkable boundaries. The launcher owns
selection, admission, plan construction, process handoff, and launch evidence;
the runtime host owns the session, provider, MCP execution, and runtime events;
operator surfaces own presentation and attachment.

## Canonical Launch Shape

The canonical selection tuple is:

```text
Site + role/agent identity + operator_surface + runtime_host + intelligence_provider
  -> capability admission -> path/fabric admission -> launch transaction
  -> owned process handoff -> (exact session attachment | explicit terminal handoff)
  -> persisted success or failure evidence
```

An omitted value is not an implicit default after the selection boundary. A
registry default must be resolved and recorded with its source before execution.
`registry default` is a selector sentinel, not an execution value.

## Durable Attempt Authority

Every non-dry-run workspace launch creates one execution-attempt record in the
User Site before planning. The record is the restart boundary for the launcher;
it is not a second runtime database. It contains the launch selection, registry
paths, canonical site/agent/session bindings, redacted process evidence, the
terminal handoff, and the latest failure. Each boundary advances the same
record through:

```text
queued -> planning -> launching -> handoff_recorded|observing -> launched
                                      \-> failed|recoverable -> recovery_requested -> recovered
```

The record is written with temp-file-and-rename semantics and carries an
executor lease (`owner_pid`, lease id, heartbeat, and expiry). Recovery skips a
live owner and only considers a stale lease. Explicit `--attempt` selection does
not override this guard and cannot recover a terminal `launched` or `failed`
attempt.

`narada launcher workspace-recover` may request cleanup only after it proves the
exact recorded launch session and an admitted NARS control path or persisted
process identity. A close request is recorded as `recovery_requested`; it is
never reported as `recovered` until a later observation proves the session is
terminal/absent and every persisted hidden process is absent or terminated.
Missing index evidence is `recoverable`, never an assertion that there is
nothing to clean up. Persisted result and attempt records are redacted at their
serializer boundaries; raw command material is never the recovery authority.

Detached Web UI projection processes remain recoverable after the launcher
process exits. Their durable record includes the exact launch-binding marker and
session identity. Restart recovery may terminate one only when the live OS
process command line proves that marker; forged or markerless process records
are refused.

## Web UI-Only Projection

When `agent-web-ui` is the only selected operator surface for a NARS runtime,
the plan has no Windows Terminal tab. Narada CLI starts the runtime host as a
hidden, session-owned structured-argv process, waits for exact healthy
attachment, then starts the Web UI as a second hidden, session-bound structured
projection process. The projection process must remain alive through a bounded
post-spawn readiness window and atomically publish a
`narada.agent_web_ui.readiness.v1` artifact containing the exact session and
listening URL; the launcher validates that artifact before recording
`spawned_and_alive`. NARS remains the single runtime authority. A mixed launch
that includes `agent-cli` uses the visible terminal projection for the shared
runtime and attaches Web UI through its explicit terminal projection tab.

## Enforced Constraints

| # | Constraint | Enforcement owner | Evidence or test |
| --- | --- | --- | --- |
| 1 | Surface, runtime, provider, MCP scope, and authority form one admitted capability matrix. | `workspace-launch-contracts.ts` and the runtime-selection contract | Launcher admission and plan tests |
| 2 | Hidden runtime launches progress `planned -> preflighted -> spawned -> attached -> completed`; visible terminal launches progress `planned -> preflighted -> spawned -> handed_off -> completed`; any pre-completion failure records `failed` or `recoverable` with rollback evidence and a durable attempt record. | `workspace-launch-contracts.ts`, `workspace-launch-executor.ts`, and the execution-attempt store | Transaction, recovery, attachment, and failure-artifact tests |
| 3 | Multi-agent launch is bounded and rolls back every owned hidden child on failure. Visible terminal handoff is explicitly bounded because accepted terminal tabs cannot be reclaimed by the parent. | Workspace executor and process ownership helpers | Executor/launcher tests and persisted failure-artifact rollback evidence |
| 4 | Narada, Site, workspace, and config paths carry explicit provenance; no cross-scope fallback is synthesized. | `workspace-launch-contracts.ts` and plan builder | Path provenance assertions |
| 5 | Browser and client attachment use the exact launch binding/session, canonical agent/site identity, and endpoint. Attachment is accepted only after the endpoint returns JSON `status: healthy` and matching session and identity evidence; ambiguous, starting, mismatched, or endpoint-less discovery is refused. | Launch binding lease and Web UI attachment command | Attachment refusal and health-identity tests |
| 6 | Every hidden runtime child has an executor-issued owner reference, structured argv, bounded capture, and tree termination path; rollback records per-child identity, status, reason, and orphan counts, and refuses forged process records. Persisted detached projections carry a restart-verifiable launch marker. | `workspace-launch-process.ts` and executor | Process ownership, persisted-cleanup, and rollback evidence tests |
| 7 | Refusals and execution failures use stable reason codes, bounded redacted messages, next steps, retry posture, and a typed artifact. Artifact write failures are never swallowed or represented as `written`; the durable attempt and CLI refusal identify `write_failed`. | CLI wrapper, admission, executor, and persistence boundary | Refusal and failure-artifact tests |
| 8 | Runtime output is separated into conversation, activity, diagnostics, and health lanes. Routine health is state, not chat. | Runtime event projection and Agent Web UI projection | Projection tests and browser checks |
| 9 | Provider credentials come from User Site Secret Store authority. Environment fallback is explicit and its provenance is recorded. | `agent-start` provider preflight | Provider option/credential contract tests |
| 10 | Writers emit only the current schema. Readers may migrate bounded legacy records through named version transforms. | Package contracts and migration readers | Schema/registry contract tests |
| 11 | Selector choices are generated from admitted registries and current capability context. | Workspace launch admission policy | Selector and provider-choice tests |
| 12 | `Carrier` is read-side compatibility only. Canonical launcher inputs and new contracts use `operator_surface`; removal waits for downstream consumers to migrate. | Operator-surface runtime contract and launcher boundary | Compatibility tests and migration metadata |
| 13 | MCP scope is explicit. Missing scope means `none`; `all` is an explicit policy value, never ambient fallback. | Runtime server, Cloudflare projection, and launch plan | MCP-scope tests |
| 14 | Persisted registry defaults are not execution values. The selector preserves the sentinel until resolution records the selected value and source. | Selector model and selection-resolution contract | Default-selection tests |
| 15 | Terminal command arrays are projection metadata only. They are not the launch authority for hidden runtime execution. A Web UI-only projection uses a separate owned structured-argv handoff after exact runtime attachment and bounded process-readiness observation; mixed launches may use an explicit visible terminal projection. A visible terminal result is `handed_off`, not `attached`; hidden capture mode is explicitly `not_checked`. | Plan/preflight/terminal contracts and executor | Plan, projection, readiness, and preflight assertions |
| 16 | Resolved defaults are never synthesized from surface names or missing fields. Unsupported or missing values fail closed with provenance. | Runtime/provider admission and registry parser | Unsupported-selection tests |
| 17 | Structured argv is authoritative for product process execution. A shell string is admitted only for an explicitly labeled visible projection handoff. Hidden runtime and Web UI-only projection processes are always session-owned and structured. | Process launch contract and executor | Structured-argv and projection-posture tests |
| 18 | Each view receives one canonical event projection. Provider telemetry, replay aliases, and local echoes are deduplicated before rendering. | Agent Web UI session projection | Conversation/activity/duplicate-event tests |

## Refusal Contract

Every launcher refusal is actionable without inspecting an exception string:

```json
{
  "schema": "narada.workspace_launch.action_refusal.v1",
  "status": "refused",
  "reason_code": "stable_machine_code",
  "message": "bounded redacted explanation",
  "required_next_step": "operator action",
  "artifact_path": null,
  "retryable": false
}
```

The command wrapper, operator-surface admission, and launcher dashboard actions
must preserve this shape. Detailed diagnostics belong in the referenced artifact
or structured command result, not in the primary operator transcript.

## Compatibility Boundary

Legacy names and schemas remain only where persisted records or unmigrated
consumers require them. Compatibility fields must be labeled as such and must
not become new source-of-truth inputs. In particular, `carrier_kind` and related
aliases are accepted at the migration edge but new launcher code selects
`operator_surface_kind`.

Likewise, the runtime server and Cloudflare projection must receive an explicit
MCP scope. A missing value is intentionally inert. This prevents a newly added
runtime from silently inheriting every User Site or Host MCP surface.

## Verification Ladder

Use focused checks first:

```powershell
pnpm --dir packages/layers/cli exec tsc -p tsconfig.json --noEmit
pnpm --dir packages/layers/cli exec vitest run --silent test/lib/command-wrapper.test.ts test/commands/workspace-launch-admission.test.ts test/commands/workspace-launch-execution-boundaries.test.ts test/commands/launcher-workspace-plan.test.ts test/commands/carrier-launcher.test.ts
pnpm --dir packages/agent-start exec node test/launcher-registry-contract.test.mjs
pnpm --dir packages/agent-start exec node test/option-contract.test.mjs
pnpm --dir packages/agent-runtime-server exec node --test test/server-wrapper.test.mjs
pnpm --filter @narada2/agent-web-ui test
pnpm --filter @narada2/cli build
```

The full verification suite remains the release gate. A passing focused suite
proves the launcher contract slice; it does not authorize skipping unrelated
repository checks.
