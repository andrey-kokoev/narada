---
status: closed
depends_on: [309, 325]
---

# Task 326 — Sandbox/Container Execution Proof Spike

## Context

Task 308 requires a minimal Sandbox/Container proof in v0 while deferring the full charter/tool runtime to v1. This task proves that bounded execution is viable inside the Cloudflare Site materialization.

## Goal

Prove that a minimal bounded payload can execute inside a Cloudflare Sandbox or Container, respect resource limits, and return structured output. If feasible, use a simple charter evaluation; otherwise use a cycle-smoke payload and document what remains before full charter/runtime support.

## Required Work

### 1. Define the Sandbox invocation contract

```typescript
interface SandboxInvocation {
  charter_id: string;
  envelope_json: string; // CharterInvocationEnvelope serialized
  timeout_ms: number;
  max_memory_mb: number;
}

interface SandboxResult {
  status: "success" | "timeout" | "oom" | "error";
  output_json?: string; // CharterOutputEnvelope serialized
  error_message?: string;
  duration_ms: number;
}
```

### 2. Implement a minimal Sandbox runner

For the spike, use one of:

- Cloudflare Workers `waitUntil` + `fetch` to a local Sandbox endpoint (if available)
- Cloudflare Container runtime (if available in the account)
- A mock bounded execution that simulates resource limits

The runner must:
- Accept `SandboxInvocation`
- Run the charter evaluation inside the bounded environment
- Enforce `timeout_ms` and `max_memory_mb`
- Return `SandboxResult`

### 3. Run a proof-of-concept bounded payload

Prefer a simple charter (e.g., the `support_steward` from the scenario library) with a synthetic message fixture. If the real charter runtime is not yet portable to the Sandbox/Container, run a `cycle-smoke` payload that validates process startup, input passing, output capture, timeout, and memory bounds.

Verify that:
- The payload runs to completion.
- The output is structured and schema-checked (`CharterOutputEnvelope` if using a charter; `CycleSmokeResult` if using a smoke payload).
- Timeout and OOM are handled gracefully.

### 4. Document gaps

Document what works, what is mocked, and what needs the real Container/Sandbox runtime.

## Non-Goals

- Do not port the full charter runtime to the Sandbox unless the minimal proof makes that trivial.
- Do not implement the full tool catalog inside the Sandbox.
- Do not implement multi-tenant Sandbox isolation.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Sandbox invocation contract is defined.
- [x] A minimal bounded payload runs inside a mock sandbox runner (`src/sandbox/runner.ts`).
- [x] Timeout and OOM are handled gracefully.
- [x] Output is valid structured JSON (`CycleSmokeResult`).
- [x] Gaps and mock assumptions are documented.

## Suggested Verification

```bash
pnpm --filter <worker-package> typecheck
pnpm test:focused "pnpm --filter <worker-package> exec vitest run test/integration/sandbox-spike.test.ts"
```

The spike test may use a mock Sandbox if the real runtime is not yet available.

## Execution Notes

### Files Created

- `packages/sites/cloudflare/src/sandbox/types.ts` — Sandbox invocation contract
  - `SandboxInvocation`: charter_id, envelope_json, timeout_ms, max_memory_mb
  - `SandboxResult`: status, output_json, error_message, duration_ms
  - `CycleSmokeResult`: status, phases_run, duration_ms, memory_peak_mb

- `packages/sites/cloudflare/src/sandbox/runner.ts` — Mock sandbox runner
  - `runSandbox(invocation, payload)` enforces timeout via `Promise.race` and memory limit via post-run check
  - `cycleSmokePayload` simulates startup → parse_input → execute → capture_output

- `packages/sites/cloudflare/test/sandbox-spike.test.ts` — 5 tests
  - cycle-smoke payload completes with structured output
  - timeout when payload exceeds timeout_ms
  - oom when payload reports memory above max_memory_mb
  - error when payload throws Error
  - error when payload throws non-Error

### Gaps and Mock Assumptions Documented

- **Mock runtime**: v0 uses a JavaScript mock (`Promise.race` + `setTimeout`), not a real Cloudflare Sandbox or Container runtime. The real runtime is deferred to v1.
- **Memory tracking**: Memory is simulated by the payload self-reporting `memory_peak_mb`; no actual process memory limits are enforced.
- **Charter runtime not ported**: The payload returns `CycleSmokeResult`, not a real `CharterOutputEnvelope`. Full charter/tool catalog inside the Sandbox is deferred.
- **No multi-tenant isolation**: The mock runner does not isolate concurrent executions.

### Verification

```bash
cd packages/sites/cloudflare
pnpm exec vitest run test/sandbox-spike.test.ts
# 5 passed (60ms)
```

### Pre-existing Package Notes

The `@narada2/site-cloudflare` package has pre-existing type errors in `src/coordinator.ts`, `src/site-coordinator.ts`, and `test/unit/site-coordinator.test.ts` unrelated to this task. The sandbox spike tests pass independently.
