# Decision: Operation Realization Chapter Closure

## Date

2026-04-20

## Chapter

Operation Realization

## Capabilities Delivered

### Task 283 — Intent-to-Operation Bootstrap Contract
- `docs/product/bootstrap-contract.md` defines the canonical five-step path: express intent → initialize repo → select vertical/posture → validate prerequisites → reach runnable state.
- `QUICKSTART.md` restructured as the walkthrough, mapping three entry paths (show me / try safely / go live) to the contract steps.
- `init-repo.ts` emits a categorized artifact manifest (`[package]`, `[config]`, `[directory]`, etc.) and next-step guidance.
- `want-mailbox.ts` emits the live bootstrap sequence after successful creation.

### Task 284 — Real Executor Attachment and Degraded-State Contract
- `probeHealth()` added to `CharterRunner` interface (all three implementations: `CodexCharterRunner`, `MockCharterRunner`, control-plane `CharterRunner`).
- Five degraded-state classes defined in `packages/domains/charters/src/runtime/health.ts`:
  - `healthy` — full execution
  - `degraded_draft_only` — execution continues, effects restricted
  - `partially_degraded` — execution continues with retry backoff
  - `broken` — execution skipped
  - `unconfigured` — execution skipped (mock runtime)
- `getRecoveryGuidance(healthClass)` returns structured operator guidance (`operator_action`, `safe_behavior`, `inspectable`).
- Execution gating in daemon `runDispatchPhase()`: blocked when production runner health does not permit execution.
- `charter.degraded_mode?: "draft_only" | "normal"` config field forces `require_human_approval: true` at the foreman layer.
- Health surfaced in `.health.json`, `/health`, `/ready`, `narada doctor`, `narada status`, and `narada ops`.

### Task 285 — First Mailbox Operation End-to-End Product Proof
- `docs/product/first-operation-proof.md` defines the support mailbox (`help@global-maxima.com`) as the canonical proof case.
- Fixture-backed proof documented: `smoke-test.test.ts` proves the full pipeline through draft creation with mock Graph client.
- Live-backed proof documented: what requires real Graph API credentials and charter runtime.
- Explicit separation table states what is proven offline vs what requires live exercise.
- Inspection checkpoints for every pipeline stage (SQL queries + CLI commands).
- Public repo vs private ops repo boundaries documented.

### Task 286 — Operator Live-Loop Ergonomics
- `docs/product/operator-loop.md` defines the five-step operator loop: healthy → happened → attention → drafts → next.
- `narada ops` CLI command composes health, recent activity, attention queue, drafts pending review, and suggested next actions into one read-only dashboard.
- Normal operating rhythm documented: morning check (5 min), mid-day triage (2 min), evening check (3 min).
- First troubleshooting steps documented: doctor → status --verbose → show → logs → health file → recover --dry-run.
- 7 focused tests in `ops.test.ts` covering health detection, PID fallback, drafts, stuck work, suggested actions, and invalid config.

## Integrated Review

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Bootstrap path is canonical | ✅ Satisfied | `docs/product/bootstrap-contract.md` is the single source of truth. `narada init-repo` and `narada want-mailbox` emit aligned next steps. |
| Executor attachment is real and safe | ✅ Satisfied | `probeHealth()` is first-class on `CharterRunner`. Execution gating skips dispatch when health is `broken`/`unconfigured`. Degraded modes are explicit and enforced. |
| First mailbox operation is a convincing proof | ✅ Satisfied | `docs/product/first-operation-proof.md` packages existing tests into a canonical narrative. Fixture/live separation is explicit. Inspection checkpoints exist for every stage. |
| Operator live loop is coherent | ✅ Satisfied | `docs/product/operator-loop.md` defines the loop. `narada ops` presents it in one command. Runbook integrates it. Disposition commands have a documented discovery path. |
| Degraded-state handling is explicit | ✅ Satisfied | Five health classes with documented production behavior. `getRecoveryGuidance()` provides concrete operator advice. Health is visible in CLI, API, and health file. |

## Deferred Gaps

| Gap | Priority | Rationale |
|-----|----------|-----------|
| Live Graph API draft creation proof | **P1** | Requires real credentials; fixture-backed proof covers mechanical correctness but not real API behavior. |
| Autonomous send path | **P2** | Safety-first posture keeps this deferred. `draft-only` with human approval is the production default. |
| Multi-vertical operations (timer, webhook, filesystem) | **P2** | Mailbox is the first proven vertical. Others need separate acceptance tasks. |
| Fleet/multi-operation dashboard | **P3** | `narada ops` is scoped to one config at a time. Fleet view is a separate product milestone. |
| Real-time UI updates for operator loop | **P3** | CLI is the primary surface. UI polling is functional but not real-time. |
| Commit-boundary tracking | **P3** | Explicitly deferred. No commit hash range established for this chapter. |

## Residual Risks

1. **LLM output non-determinism**: The fixture-backed proof uses a hardcoded charter runner. Real `CodexCharterRunner` output varies, which means the live-backed proof cannot be as strictly asserted as the fixture-backed one.
2. **Health probe timing**: `probeHealth()` is called at dispatch phase, not continuously. A charter runtime could fail between probes, and the first failing execution attempt would discover it.
3. **Operator loop discoverability**: `narada ops` is new. Operators used to `status` and `doctor` may not discover it without reading the docs.
4. **PID file race**: `narada ops` and `narada doctor` check PID files that may be stale if the daemon crashes without cleaning up.

## Closure Statement

The Operation Realization chapter is closed. Narada now has:
- A canonical bootstrap path from intent to runnable operation
- Real executor attachment with explicit degraded-state contract
- A convincing first mailbox operation product proof
- A coherent operator live loop with dedicated CLI surface

This closure is honest about its deferrals and residuals. The chapter does not claim to solve autonomous send, fleet orchestration, or real-time UI polish.
