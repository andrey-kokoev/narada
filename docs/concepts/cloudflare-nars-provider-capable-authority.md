# Provider-Capable Cloudflare NARS Authority

Status: historical Task 2112 decision, superseded by the canonical invokable-intelligence cutover (Tasks 2214–2219). Current Cloudflare authority resolves every invocation from the D1 catalog and policy; historical provider-binding evidence remains evidence of the earlier slice, not current selection authority.

This document is the binding authority-design decision for growing the Cloudflare-origin NARS slice from synthetic/no-provider into a provider/tool-capable authority runtime. It preserves the principled asymmetry and the authority invariants established by the canonical runtime surface contract (`narada.nars.runtime_surface_contract.v1`, `packages/nars-runtime-contract/src/runtime-surface-contract.mjs`) and by [`cloudflare-nars-web-projection.md`](cloudflare-nars-web-projection.md).

## Decision 1 — Provider Dispatch Model

Provider execution on Cloudflare is an **in-Durable-Object HTTPS provider adapter** (`cloudflare_provider_http_adapter`), one provider call per admitted turn, inside the session's ordered mutation lane.

- **Execution site**: the authority Durable Object performs an outbound HTTPS call to the configured provider API. Cloudflare Workers/DO cannot spawn child processes; the local `codex exec`/owned-process model is explicitly not portable and not attempted.
- **Wire contract**: an immutable invocation plan names the selected offering, route, protocol adapter, endpoint, and credential locator. Cloudflare dispatches through the canonical plan-driven protocol adapter; the runtime does not infer those coordinates from provider names or environment variables.
- **Turn event shape**: `turn_started` → `provider_request` → terminal provider evidence (`provider_response` with content, or `provider_error`) → `assistant_message` → `turn_complete`. Streaming deltas from the provider are a declared later increment; the first provider-capable slice uses non-streaming request/response and remains truthful (no claim of streaming).
- **Timeout and abort**: each attempt is bounded by the plan's temporal contract and revalidated before dispatch. Operator cancellation records interruption separately from provider failure and terminal outcome.
- **Idempotency and cost**: intent, operation, plan, and attempt ids govern retries and replay. The authority records each attempt and never duplicates a completed operation.
- **Credentials**: credential bindings remain secret infrastructure. The catalog stores only credential locators, grants, and provenance; raw values never appear in plans, events, health, or diagnostics.
- **Selection**: inference provider, model provider, model, capabilities, route, access, and defaults are canonical D1 resources evaluated per invocation. Worker bindings provide infrastructure handles only and cannot select intelligence.

## Decision 2 — Governed Tool-Execution Boundary

Two tool classes, one admission boundary:

- **Cloudflare-native fabric tools** (existing `cf-authority`, `cf-authority-artifacts` MCP fabric): execute in-DO as today.
- **Provider-driven tool calls** (model-requested): admitted only when the tool is registered in the session's MCP fabric. Each effect emits `tool_call`/`tool_result` with an explicit admission decision (`read_only_admitted`, `authority_mutation_admitted`, or a typed refusal). This extends the existing executor pattern (`createCloudflareNarsToolAdapterRuntimeExecutor`) rather than replacing it.

Hard exclusions, refused with typed refusals (e.g., `local_tool_authority_absent`): local filesystem tools, local shell/process execution, local MCP scopes, and any tool not registered in the session fabric. No arbitrary code execution on the hosted edge.

## Decision 3 — Capability-Profile Graduation Contract

Each capability dimension gains a graduation state machine: `absent → declared → present`.

- `absent`: dimension unavailable (current synthetic default).
- `declared`: dimension configured (e.g., provider binding present) but unproven.
- `present`: dimension proven by executed evidence at the authority boundary (for `provider_execution`: a completed provider turn in the ordered event log).

Contract changes (`packages/nars-runtime-contract/src/runtime-surface-contract.mjs`):

- `NARS_CAPABILITY_STATES` becomes `['absent', 'declared', 'present']`.
- Contracts may carry an optional `capability_evidence` map: dimension → `{ state, evidence_ref, graduated_at }`. A `present` state without an evidence ref is invalid; a `declared` state without a configuration ref is invalid.
- The Cloudflare-origin hard rules change scope: `provider_execution` may graduate; `local_tool_execution`, `local_mcp`, `local_filesystem_authority`, `local_artifact_authority` must remain `absent` on Cloudflare-origin forever (validator keeps rejecting their presence).
- `cloudflare_native_mcp` keeps `absent | fabric_summary` (orthogonal to provider capability).

Graduation is per session and reported in session/health diagnostics. Synthetic fixture sessions never graduate; the synthetic executor remains a labeled fixture mode.

## Decision 4 — Artifact and Filesystem Posture

Unchanged. No local artifact source authority and no filesystem authority on the Cloudflare-origin slice. The session-native artifact adapter (`cf-authority-artifacts`) remains the only artifact mutation path, session-scoped and evidence-emitting. Artifact content bytes remain policy-gated projection, never local `source_path` exposure.

## Decision 5 — Dual-Host and Epoch Implications

Provider capability does not change host-transition admission: source seal, authority epoch token, and `target_first_sequence` boundary remain required and sufficient, regardless of capability profile.

One new rule: a session with an in-flight provider turn cannot seal mid-turn. Drain first resolves the active turn (interrupt with `turn_interrupted` evidence or let it terminate), then seals. The carrier-protocol provider handoff enum gains a mode for provider-capable sessions (e.g., `interrupt_active_turn_before_seal`); `unsupported_for_synthetic_slice` and `not_present` remain valid for synthetic sessions.

Ambiguous dual-host stays durably refused (`dual_host_authority_conflict`).

## Decision 6 — Crossing-Regime Declarations (SEMANTICS §2.15, Task 495)

1. **Provider dispatch** — source_zone: Cloudflare-origin authority runtime; destination_zone: external provider API; authority_owner: CF authority provider adapter; admissibility_regime: provider binding + admitted turn + abort/timeout policy + request-id idempotency; crossing_artifact: provider turn evidence events (`provider_request`/`provider_response`/`provider_error`); confirmation_rule: terminal turn evidence appended to the ordered session event log; anti-collapse invariant: provider output is session evidence, never session authority — the provider cannot mutate session truth outside admitted turn events.
2. **Provider-driven tool effect** — source_zone: provider turn; destination_zone: session MCP fabric execution; authority_owner: tool admission boundary of the authority service; admissibility_regime: tool registered in session fabric + per-effect admission decision; crossing_artifact: `tool_call`/`tool_result` events with admission decision; confirmation_rule: ordered `tool_result` appended with the decision recorded; anti-collapse invariant: no tool executes outside the registered fabric; local tool authority stays absent.

Credential binding is configuration admission (env binding name), not a durable artifact crossing; no third regime required.

## Decision 7 — Rejected Alternatives

- **Stay synthetic forever**: rejected. The synthetic slice was always a bounded first step (see `cloudflare-nars-web-projection.md` evidence notes); the operator goal is full NARS functionality.
- **Full local-NARS parity on Cloudflare** (filesystem, shell, local MCP scopes): rejected. It violates principled asymmetry, exposes machine-local authority to a hosted edge, and contradicts the contract's permanent absent rules.
- **Delegate provider turns back to local NARS** (turn proxy): rejected as an execution model. Turns executed locally while owned by the Cloudflare authority would collapse authority across zones — the owner of a turn's evidence must be the runtime that admitted it. A provider *endpoint* may still be shared with local runtimes, but dispatch, abort, and evidence are owned by the Cloudflare authority.

## Follow-Up Tasks

- Task 2113 — implements this decision (provider dispatch, tool boundary, capability graduation, tests).
- Task 2114 — live authority host transition (consumes Decision 5's seal rule).
- Task 2115 — authorized live smoke evidence for the provider-capable runtime.
