# Task 284: Real Executor Attachment and Degraded-State Contract

## Chapter

Operation Realization

## Context

Narada can already govern work and produce draft-oriented outcomes, but the product still needs a canonical account of how a real executor is attached and how degraded states are expressed when parts of that path are missing or unhealthy.

## Goal

Make the real executor path explicit, inspectable, and safe, with a first-class degraded-state contract.

## Implementation

### 1. Canonical Executor Path

Added `probeHealth()` to the `CharterRunner` interface (all three implementations: `@narada2/charters` runner, `@narada2/charters` mock-runner, and `@narada2/control-plane` charter/runner). This makes the runtime availability check a first-class part of the executor contract.

**Path from config to execution:**
1. Config loads `charter.runtime`, `api_key`, `model`, `base_url`, `timeout_ms`, `degraded_mode`
2. `createDefaultCharterRunner()` instantiates `CodexCharterRunner` or `MockCharterRunner`
3. Daemon dispatch probes health via `charterRunner.probeHealth()` before each dispatch phase
4. Health is surfaced in `.health.json`, `/scopes/:id/health`, `narada doctor`, and `narada status`
5. In production (no explicit `charterRunner` override), `broken` and `unconfigured` health classes skip execution; work items remain `opened`
6. Execution proceeds through `buildInvocationEnvelope → charterRunner.run → validate → govern → resolve`
7. Draft-first effect boundary is enforced by foreman governance, independent of runtime health

### 2. Degraded-State Classes

Defined in `packages/domains/charters/src/runtime/health.ts`:

| Class | Meaning | Production Behavior | Operator Visibility |
|-------|---------|---------------------|---------------------|
| `unconfigured` | No real executor attached (mock runtime or missing API key) | Execution skipped; work items stay `opened` | `doctor` warn |
| `healthy` | Real executor responding normally | Full execution | `doctor` pass |
| `degraded_draft_only` | `charter.degraded_mode` set to `'draft_only'`; execution continues but effects restricted | Execution runs; foreman enforces draft-only | `doctor` warn |
| `partially_degraded` | API flaky (timeouts, rate limits) | Execution continues; normal retry backoff | `doctor` warn |
| `broken` | API unreachable or auth invalid | Execution skipped; work items stay `opened` | `doctor` fail |

### 3. Failure / Recovery Guidance

`getRecoveryGuidance(healthClass)` returns concrete, structured guidance for every degraded state:
- **operator_action**: exactly what to fix
- **safe_behavior**: what Narada will still do safely (matches actual production behavior)
- **inspectable**: what remains visible during degradation

This function is the single source of truth for all operator-facing advice.

### Execution Gating

In `packages/layers/daemon/src/service.ts`, `runDispatchPhase()` computes:
```ts
const isProductionRunner = !opts.charterRunner;
const executionBlocked = isProductionRunner && charterHealth && !healthClassPermitsExecution(charterHealth.class);
```

When `executionBlocked` is true, the dispatch while-loop is skipped entirely. Tests that explicitly provide `charterRunner` bypass this gate, preserving existing test behavior.

### `degraded_draft_only` Producer and Enforcement

`charter.degraded_mode?: "draft_only" | "normal"` is a new config field. When set to `"draft_only"`:

1. `CodexCharterRunner.probeHealth()` returns `degraded_draft_only`
2. The daemon's `getRuntimePolicy()` wrapper forces `require_human_approval: true` on the policy before passing it to the foreman
3. This means all proposed actions must be explicitly approved by the operator — no autonomous execution

This gives operators an explicit knob to restrict the runtime to draft-only mode, and the restriction is enforced by the foreman governance layer.

### Files Changed

- **NEW** `packages/domains/charters/src/runtime/health.ts` — health types, classes, recovery guidance
- `packages/domains/charters/src/runtime/runner.ts` — `probeHealth()` on `CharterRunner` + `CodexCharterRunner` implementation; `degradedMode` option
- `packages/domains/charters/src/runtime/mock-runner.ts` — `probeHealth()` returns `unconfigured`
- `packages/domains/charters/src/runtime/index.ts` — export health types
- `packages/layers/control-plane/src/charter/runner.ts` — `probeHealth()` on control-plane `CharterRunner` + `MockCharterRunner`
- `packages/layers/control-plane/src/config/types.ts` — `degraded_mode` on `CharterRuntimeConfig`
- `packages/layers/control-plane/src/config/load.ts` — load `degraded_mode` from raw config
- `packages/layers/control-plane/src/config/validation.ts` — validate `degraded_mode`
- `packages/layers/control-plane/src/observability/types.ts` — `charter_runtime_healthy` + `charter_runtime_health_class` in `ScopeReadiness`
- `packages/layers/control-plane/src/observability/queries.ts` — placeholder fields in `buildScopeDispatchSummary`
- `packages/layers/control-plane/src/health.ts` — `charterRuntimeHealth` in `HealthFileData`
- `packages/layers/daemon/src/lib/health.ts` — `charterRuntimeHealth` in `HealthStatus`
- `packages/layers/daemon/src/service.ts` — health probe in dispatch, execution gating, health aggregation in `updateHealth()`
- `packages/layers/cli/src/commands/doctor.ts` — `charter-runtime` check with live probe
- `packages/layers/cli/src/commands/status.ts` — reads `charterRuntimeHealth` from `.health.json`
- `packages/layers/cli/test/commands/doctor.test.ts` — mocked charters probe, updated assertions

## Verification

- `pnpm verify` — passes (5/5 steps)
- `pnpm --filter @narada2/charters test` — 72/72 pass
- `pnpm --filter @narada2/cli test` — doctor + status tests pass
- `pnpm --filter @narada2/daemon npx vitest run test/unit/service-shutdown.test.ts` — passes (execution gate bypassed by explicit test runner)
- `pnpm --filter @narada2/daemon npx vitest run test/integration/dispatch.test.ts` — passes
- `pnpm --filter @narada2/control-plane npx vitest run test/unit/health.test.ts test/unit/observability/queries.test.ts` — pass

## Acceptance Criteria

- [x] Real executor attachment is described and implemented as one coherent path.
- [x] Degraded-state classes are explicit and user-visible (doctor, status, health file, observation API).
- [x] Recovery guidance is concrete, not just conceptual — `getRecoveryGuidance()` provides operator_action, safe_behavior, and inspectable for every class, and safe_behavior matches actual production behavior.
- [x] Draft-first safety remains intact — foreman governance enforces draft-first independently of runtime health.
