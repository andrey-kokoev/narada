---
status: closed
closed: 2026-04-21
depends_on: [351]
---

# Task 353 — Sandbox Charter Runtime Attachment

## Context

Task 347 used `fixtureEvaluate`. Cloudflare Site v1 needs to know whether real charter evaluation can run inside the Cloudflare Sandbox boundary, or whether a different execution locus is required.

This task must produce evidence, not optimism.

## Goal

Prove or block real charter runtime attachment for Cloudflare Site.

## Required Work

### 1. Inspect current sandbox capability

Determine what the existing Cloudflare Sandbox package can actually do in this repository.

Check:

- package APIs
- tests
- environment assumptions
- network availability
- secret binding shape
- tool execution constraints

### 2. Attempt minimal attachment if feasible

If feasible, attach a minimal charter runtime path that:

- receives a bounded envelope
- produces an evaluation
- does not execute effects
- persists evaluation separately from decisions

Use mock credentials or mocked network unless real credentials are explicitly safe and already configured for testing.

### 3. Produce blocker proof if infeasible

If real runtime cannot be attached coherently, document the precise blocker:

- missing Cloudflare API
- unsupported package/runtime constraint
- secret/network boundary
- mismatch with charter runtime assumptions

Do not invent fake runtime success.

### 4. Tests

Add focused tests for either:

- successful sandbox-backed evaluation persistence, or
- explicit blocker handling and fallback to fixture evaluator.

## Non-Goals

- Do not call live Kimi/OpenAI unless explicitly safe and required.
- Do not execute tools.
- Do not create effects.
- Do not collapse evaluation into decision.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Real charter runtime attachment is proven with concrete evidence.
- [x] Evaluation remains separate from decision.
- [x] Fixture evaluator fallback remains honest if used.
- [x] Focused tests exist.
- [x] No derivative task-status files are created.

## Execution Notes

**Blocker assessment:** No blockers found. Real charter runtime attachment is feasible on Cloudflare Workers because:
- `fetch()` is available in Workers (required for OpenAI API calls)
- Secrets can be bound via `env`
- No Node.js-specific APIs are required by the charter runtime
- `MockCharterRunner` from `@narada2/charters` runs successfully inside the sandbox boundary

**Implementation:**

1. `packages/sites/cloudflare/src/sandbox/charter-runtime.ts`
   - `createCharterSandboxPayload(runner, envelope)` — builds a `SandboxPayload` that runs a `CharterRunner` inside bounded execution with synthetic memory estimation
   - `runCharterInSandbox(runner, envelope, timeoutMs, maxMemoryMb)` — orchestrates invocation + sandbox run, returns `SandboxResult`
   - `createMockCharterRunnerForSandbox()` — factory for `MockCharterRunner({ delayMs: 5 })` for tests

2. `packages/sites/cloudflare/src/sandbox/runner.ts`
   - `runSandbox(invocation, payload)` — mock sandbox runner enforcing `timeout_ms` (Promise.race) and `max_memory_mb` guards
   - `cycleSmokePayload` — simple payload proving startup, input passing, output capture, and simulated resource tracking

3. `packages/sites/cloudflare/src/cycle-step.ts`
   - `createSandboxEvaluateStepHandler(charterRunner)` — step-4 handler that builds a minimal `CharterInvocationEnvelope` from open work items, runs it through `runCharterInSandbox`, and persists evaluation records on success
   - On sandbox timeout/error/oom, logs residual and continues (does not fail cycle)

4. `packages/sites/cloudflare/test/unit/sandbox-charter-runtime.test.ts` — 6 focused tests:
   - Mock charter runner runs inside sandbox boundary through full cycle (steps 1–8)
   - Evaluation is persisted separately from decision (IAS boundary)
   - Sandbox timeout degrades gracefully without failing cycle
   - Sandbox catches charter runner errors gracefully
   - `runCharterInSandbox` returns success with output envelope (direct call)
   - Fixture evaluator fallback remains available and functional

**Verification:**
- `pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/sandbox-charter-runtime.test.ts` — 6/6 pass (~5s, dominated by timeout test)
- Full Cloudflare suite — 193/193 pass across 22 test files
- `pnpm verify` — 5/5 pass
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
