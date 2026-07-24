# Workspace Launch Enforcement Contract

This document is the implementation map for the workspace launcher. It turns the
launcher target shape into mechanically checkable boundaries. The launcher owns
selection, admission, plan construction, process handoff, and launch evidence;
the runtime host owns the session, provider, MCP execution, and runtime events;
operator surfaces own presentation and attachment.

## Terminology

`workspace-launch` is the launch-registry-driven command name, kept for
compatibility. "Workspace" scopes the registry the selection comes from; it
does not imply multi-agent grouping. The interactive grouping product was
removed in task #2041 (decision 20260718-2038). The two supported shapes are
single-agent launch (`narada launcher workspace-launch --agent <id>`) and
Site-level launch (`narada sites launch <site-id>`).

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

## Launch Transaction and Failure Evidence

Every workspace launch runs one in-memory launch transaction. The transaction
carries the launch selection, registry paths, canonical site/agent/session
bindings, redacted process evidence, the terminal handoff, and the latest
failure. Each boundary advances the same record through:

```text
planned -> preflighted -> spawned -> handed_off|attached -> completed
                                   \-> failed
```

On a pre-completion failure the executor rolls back every owned hidden child
and records per-child rollback evidence. The CLI then writes a best-effort,
redacted failure artifact into the User Site; an artifact write failure is
reported as `write_failed`, never silently swallowed.

### NARS Session Authority

The Site-local NARS session index is discovery and history; it is not the
singleton lock. Every executable `narada-agent-runtime-server` start receives
an admission from the NARS session-authority SQLite database at
`.ai/runtime/session-authority.sqlite` before the runtime is materialized. The
admission is bound to the normalized `(authority_scope, site_id,
local_agent_id)` principal and carries a private lifecycle owner token,
monotonically increasing epoch, lease, and exact session handoff. The runtime must activate
and heartbeat that admission; a fenced or expired admission cannot continue.

If the authority database has no record but the legacy session index still
contains a live matching session, the launcher refuses with
`session_authority_legacy_duplicate` and includes the exact candidate and
attach handoff when there is one unambiguous candidate. It never chooses the
newest or oldest session. Repair is explicit:

```powershell
narada nars session reconcile --site-root <site-root> --agent <local-agent-id> --keep-session <session-id>
narada nars session reconcile --site-root <site-root> --agent <local-agent-id> --keep-session <session-id> --apply
```

The first command is a plan. `--apply` only records reconciliation after all
matching sessions are inactive; it does not adopt a running legacy process.
The next start must pass through launcher admission. This boundary prevents
the previously observed duplicate healthy-session ambiguity across launcher,
NARS, and Web UI attachment.

The earlier durable execution-attempt store, the `recoverable` /
`recovery_requested` / `recovered` states, restart recovery of detached
projections, and the `narada launcher workspace-recover` command were removed
with the interactive group-launch stack (decision 20260718-2038, task #2041).
The launcher no longer persists attempt records across process exits.

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

### Identity Correlation

The launch path carries three different identifiers and must never substitute
one for another:

| Identifier | Owner | Meaning | Where it is used |
| --- | --- | --- | --- |
| `launch_session_id` | Narada CLI launcher | Per-launch ownership and correlation token allocated before the runtime starts. | Launch binding, process ownership, attachment lookup, and recovery. |
| `nars_session_id` | NARS runtime | Exact durable runtime session identifier discovered after the runtime registers. | Attachment evidence, projection process evidence, and readiness validation. |
| readiness `session_id` | Web UI projection | The NARS session represented by `narada.agent_web_ui.readiness.v1`. | Must equal `nars_session_id` before projection readiness is accepted. |

`narada.workspace_launch.attachment.v1` is the authoritative join from
`launch_session_id` to `session_id`. The executor resolves that join after
healthy attachment, passes the resulting `nars_session_id` to the projection
process, and records it on `WorkspaceLaunchProcessLaunch`. A projection is
never ready merely because its URL exists: its readiness artifact must also
identify the exact NARS session selected by the attachment evidence.

## Enforced Constraints

| # | Constraint | Enforcement owner | Evidence or test |
| --- | --- | --- | --- |
| 1 | Surface, runtime, provider, MCP scope, and authority form one admitted capability matrix. | `workspace-launch-contracts.ts` and the runtime-selection contract | Launcher admission and plan tests |
| 2 | Hidden runtime launches progress `planned -> preflighted -> spawned -> attached -> completed`; visible terminal launches progress `planned -> preflighted -> spawned -> handed_off -> completed`; any pre-completion failure records `failed` with rollback evidence and a best-effort redacted failure artifact. | `workspace-launch-contracts.ts` and `workspace-launch-executor.ts` | Transaction, attachment, and failure-artifact tests |
| 3 | Multi-agent launch is bounded and rolls back every owned hidden child on failure. Visible terminal handoff is explicitly bounded because accepted terminal tabs cannot be reclaimed by the parent. | Workspace executor and process ownership helpers | Executor/launcher tests and persisted failure-artifact rollback evidence |
| 4 | Narada, Site, workspace, and config paths carry explicit provenance; no cross-scope fallback is synthesized. | `workspace-launch-contracts.ts` and plan builder | Path provenance assertions |
| 5 | Browser and client attachment use the exact launch binding/session, canonical agent/site identity, and endpoint. Attachment is accepted only after the endpoint returns JSON `status: healthy` and matching session and identity evidence; ambiguous, starting, mismatched, or endpoint-less discovery is refused. | Launch binding lease and Web UI attachment command | Attachment refusal and health-identity tests |
| 6 | Every hidden runtime child has an executor-issued owner reference, structured argv, bounded capture, and tree termination path; rollback records per-child identity, status, reason, and orphan counts, and refuses forged process records. Persisted detached projections carry a restart-verifiable launch marker. | `workspace-launch-process.ts` and executor | Process ownership, persisted-cleanup, and rollback evidence tests |
| 7 | Refusals and execution failures use stable reason codes, bounded redacted messages, next steps, retry posture, and a typed artifact. Artifact write failures are never swallowed or represented as `written`; the CLI refusal identifies `write_failed`. | CLI wrapper, admission, and executor | Refusal and failure-artifact tests |
| 8 | Runtime output is separated into conversation, activity, diagnostics, and health lanes. Routine health is state, not chat. | Runtime event projection and Agent Web UI projection | Projection tests and browser checks |
| 9 | Provider credentials come from User Site Secret Store authority. Environment fallback is explicit and its provenance is recorded. | `agent-start` provider preflight | Provider option/credential contract tests |
| 10 | Writers emit only the current schema. Readers may migrate bounded legacy records through named version transforms. | Package contracts and migration readers | Schema/registry contract tests |
| 11 | Explicit selections are validated against admitted registries and current capability context. | Workspace launch admission policy | Admission and provider-choice tests |
| 12 | `Carrier` is read-side compatibility only. Canonical launcher inputs and new contracts use `operator_surface`; removal waits for downstream consumers to migrate. | Operator-surface runtime contract and launcher boundary | Compatibility tests and migration metadata |
| 13 | MCP scope is explicit. Missing scope means `none`; `all` is an explicit policy value, never ambient fallback. | Runtime server, Cloudflare projection, and launch plan | MCP-scope tests |
| 14 | Persisted registry defaults are not execution values. Resolution records the selected value and its source before execution. | Registry parser and launch application | Plan and admission tests |
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

The command wrapper and operator-surface admission must preserve this shape.
Detailed diagnostics belong in the referenced artifact or structured command
result, not in the primary operator transcript.

## Compatibility Boundary

Legacy names and schemas remain only where persisted records or unmigrated
consumers require them. Compatibility fields must be labeled as such and must
not become new source-of-truth inputs. In particular, `carrier_kind` and related
aliases are accepted at the migration edge but new launcher code selects
`operator_surface_kind`.

Schema field removal is a contract change. Removing a field from a `v1` schema
without a version bump is admissible only with recorded evidence that the field
was a dead constant with zero typed, scripted, or test consumers; otherwise the
schema version must be bumped. Precedent: the `interactive_selection` /
`interactive_selection_surface` removal from `narada.workspace_launch.plan.v1`
and `narada.workspace_launch.failure.v1` (2026-07-18, consumer audit clean).

Likewise, the runtime server and Cloudflare projection must receive an explicit
MCP scope. A missing value is intentionally inert. This prevents a newly added
runtime from silently inheriting every User Site or Host MCP surface.

## Verification Ladder

Use focused checks first:

```powershell
pnpm --dir packages/layers/cli exec tsc -p tsconfig.json --noEmit
pnpm --dir packages/layers/cli exec vitest run --silent=true test/lib/command-wrapper.test.ts test/commands/workspace-launch-admission.test.ts test/commands/workspace-launch-execution-boundaries.test.ts test/commands/launcher-workspace-plan.test.ts test/commands/carrier-launcher.test.ts
pnpm --dir packages/agent-start exec node test/launcher-registry-contract.test.mjs
pnpm --dir packages/agent-start exec node test/option-contract.test.mjs
pnpm --dir packages/agent-runtime-server exec node --test test/server-wrapper.test.mjs
pnpm --filter @narada2/agent-web-ui test
pnpm --filter @narada2/cli build
```

The full verification suite remains the release gate. A passing focused suite
proves the launcher contract slice; it does not authorize skipping unrelated
repository checks.
