---
closes_tasks: [602]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 602 — Test Execution Regime Contract

## Status
**Accepted** — defines the governed execution regime for tests.

## Context
Decision 600 defined the zone boundary; Decision 601 defined the request/result artifacts. This decision defines the middle: how execution is governed, including admissibility, scope classes, timeout, retry, environment, and terminal classification.

## Decision

### 1. Admissibility Rules

A `VerificationRequest` is admissible only if **all** of the following hold:

1. `target_command` is in the **registered verification unit list** (e.g., `pnpm test:unit`, `pnpm test:integration`, `pnpm verify`).
2. `scope` is permitted for the requester's authority class:
   - `focused` — available to all requesters
   - `full` — requires `ALLOW_FULL_TESTS=1` or operator authority
3. `env_posture.fixture_mode` matches the registered unit's declared mode.
4. No in-flight request exists for the same `target_command` + `scope` + `task_id` (duplicate prevention).
5. `timeout_seconds` ≤ regime max for the scope (see §3).

### 2. Focused / Full / Forbidden Classes

| Class | Definition | Authority Required |
|-------|-----------|-------------------|
| **Focused** | Single package, file, or bounded subset | Any requester |
| **Full** | Complete suite across all packages | `ALLOW_FULL_TESTS=1` or operator |
| **Forbidden** | Live external resources without explicit flag | Explicit `LIVE_TEST_OK=1` |

A request for `full` without the env flag is classified as `invalid_request` before execution.
A request touching live resources without `LIVE_TEST_OK=1` is classified as `blocked`.

### 3. Timeout Ownership and Classes

| Scope | Default Timeout | Maximum Timeout | Owner |
|-------|----------------|-----------------|-------|
| Focused | 60s | 120s | Execution regime (runtime enforces) |
| Full | 300s | 600s | Execution regime (runtime enforces) |

- The requester may declare a shorter timeout.
- The runtime caps at the maximum and enforces via `AbortController` / `child_process.kill`.
- Timeout classification is `timed_out`, distinct from `failed`.

### 4. Retry Posture

| Scenario | Retry Policy | Who May Trigger |
|----------|-------------|-----------------|
| Default | None | — |
| Known-flaky test | 1 automatic retry, flagged in result | Runtime |
| Operator request | Up to 2 retries, logged | Operator |
| Full suite failure | None automatic (prevent retry storms) | Operator only |

Retry is **not** the default. A retry produces a **new** `VerificationRequest` and **new** `VerificationResult`; it does not mutate the original result.

### 5. Environment Posture

| Aspect | Rule |
|--------|------|
| **cwd** | Fixed to repo root. Target command paths are relative. |
| **Node/toolchain** | Checked at runtime against `env_posture.node_version_constraint`. Mismatch → `blocked`. |
| **Fixture vs live** | `mock` = no external network calls. `live` = may call external APIs (requires `LIVE_TEST_OK=1`). |

The execution regime validates environment before spawning the target command.

### 6. Terminal Classifications

| Status | Meaning | Source |
|--------|---------|--------|
| **passed** | All assertions passed, exit code 0 | Runtime classification |
| **failed** | At least one assertion failed, or exit code ≠ 0 | Runtime classification |
| **timed_out** | Execution exceeded timeout | Runtime enforcement |
| **blocked** | Environment mismatch, missing dependency, or live-test guard | Pre-execution check |
| **invalid_request** | Admissibility rule violated | Admissibility regime |

`blocked` and `invalid_request` are distinct:
- `blocked` = the request was valid but the environment could not satisfy it.
- `invalid_request` = the request itself violated a rule.

## Consequences

- **Positive**: Execution is bounded and predictable — no arbitrary timeouts or unlimited retries.
- **Positive**: Focused/full distinction prevents accidental full-suite runs in constrained environments.
- **Positive**: Terminal classifications make root-cause analysis explicit.
- **Trade-off**: Requires maintaining a registered verification unit list.
- **Trade-off**: Known-flaky retry requires a registry of flaky tests (or heuristics).
