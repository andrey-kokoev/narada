# Task 196: Diagnose Control-Plane V8 Fatal Crash

## Context

`pnpm verify` and `pnpm test:unit` in the `narada` repo fail during the control-plane unit test step with a Node/V8 fatal error:

```text
Fatal JavaScript invalid size error 169220804 (see crbug.com/1201626)
Trace/breakpoint trap (core dumped)
```

This crash blocks Task 191 verification and has been reproducible since at least Task 150.

## Evidence

### Reproducibility

- **Always reproducible** when running the full control-plane unit test suite.
- **Not reproducible** when running individual test files in isolation.
- **Not reproducible** when running `packages/domains/charters` tests alone.
- **Not reproducible** when running `packages/ops-kit` tests alone.
- **Not reproducible** when running `packages/layers/daemon` unit tests alone.
- Occurs with both default pool and `--pool=forks`.
- Occurs even when skipping `control-plane-lint.test.ts`.

### Crash Signature

```text
# Fatal error in , line 0
# Fatal JavaScript invalid size error 169220804 (see crbug.com/1201626)
v8::internal::Runtime_GrowArrayElements(int, unsigned long*, v8::internal::Isolate*)
```

Error code 169220804 maps to V8 bug crbug.com/1201626 — a known issue where `Array.prototype` operations trigger an invalid size assertion when array growth reaches a corrupted or extremely large index.

### Test Scope Affected

- `packages/layers/control-plane/test/unit/` — 74–75 test files, ~778–784 tests
- Crash happens during worker process exit, not during a specific test assertion
- Vitest reports: "Worker exited unexpectedly" (tinypool)

### Tests Changed in Task 191 / 193 That Pass Narrowly

All files modified for authority-class enforcement pass when run in isolation:

```bash
pnpm vitest run packages/domains/charters  # 69 tests pass
pnpm vitest run packages/ops-kit            # 10 tests pass
pnpm vitest run packages/layers/daemon/test/unit  # 96 tests pass
```

## Required Investigation

1. Identify which control-plane test file(s) trigger the V8 crash when run together.
2. Determine if the crash is caused by:
   - Memory exhaustion / large array accumulation across tests
   - A specific test that allocates a huge array
   - Vitest worker pool issue with Node 20 + V8
   - A regression in a specific control-plane module
3. Fix the root cause, or if it's an upstream Node/V8 bug, document a workaround:
   - `--max-old-space-size` adjustment
   - `--pool=vmThreads` or other vitest pool configuration
   - Splitting the control-plane test suite
   - Upgrading Node or vitest

## Verification

```bash
cd /home/andrey/src/narada
pnpm verify   # should pass
pnpm test:unit # should pass
```

## Definition Of Done

- [ ] Root cause of V8 crash identified with exact failing test or module
- [ ] Fix or documented workaround allows `pnpm verify` to pass
- [ ] No tests are disabled without justification
