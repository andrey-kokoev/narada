---
closes_tasks: [601]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 601 — Test Run Request And Result Artifact Contract

## Status
**Accepted** — defines the canonical request and result artifacts for governed test execution.

## Context
Decision 600 established that testing is a zone with three irreducible objects. This decision defines the shape of the request and result artifacts precisely.

## Decision

### 1. Request Artifact (`VerificationRequest`)

```typescript
interface VerificationRequest {
  request_id: string;              // UUID — canonical identity
  task_id: string | null;          // Linkage to originating task (nullable)
  target_command: string;          // Registered verification unit (e.g. "pnpm test:unit")
  scope: "focused" | "full";       // Focused = subset; full = complete suite
  timeout_seconds: number;         // Requested timeout (capped by regime max)
  env_posture: EnvPosture;         // Environment assumptions
  requester_identity: string;      // operator, agent_id, or system
  requested_at: string;            // ISO timestamp
  rationale: string | null;        // Why this verification is being run
}

interface EnvPosture {
  node_version_constraint: string | null;  // e.g. ">=20"
  fixture_mode: "mock" | "live";           // Whether external resources are touched
  cwd_relative: string;                    // Working directory relative to repo root
}
```

**Authority:** The requester owns the content of the request. The admissibility regime owns whether it is accepted.

### 2. Result Artifact (`VerificationResult`)

```typescript
interface VerificationResult {
  result_id: string;               // UUID — canonical identity
  request_id: string;              // FK to the request that produced this result
  status: TerminalStatus;          // Canonical classification
  exit_code: number | null;        // Raw process exit code (null if not reached)
  duration_ms: number;             // Wall-clock duration of execution
  metrics: VerificationMetrics;    // Machine-parsed counts
  stdout_digest: string | null;    // SHA-256 of full stdout (null if empty)
  stderr_digest: string | null;    // SHA-256 of full stderr (null if empty)
  stdout_excerpt: string | null;   // First N chars (bounded, for quick inspection)
  stderr_excerpt: string | null;   // First N chars (bounded, for quick inspection)
  completed_at: string;            // ISO timestamp
}

interface VerificationMetrics {
  test_count: number | null;
  pass_count: number | null;
  fail_count: number | null;
  skip_count: number | null;
}

type TerminalStatus =
  | "passed"
  | "failed"
  | "timed_out"
  | "blocked"
  | "invalid_request";
```

**Authority:** The execution regime produces the result. The result store owns its persistence.

### 3. Authoritative vs Advisory Split

| Layer | Content | Authority |
|-------|---------|-----------|
| **Authoritative** | `status`, `exit_code`, `duration_ms`, `metrics`, `request_id` | Result artifact — immutable after commit |
| **Advisory** | `rationale`, `stdout_excerpt`, `stderr_excerpt`, summary text | Projections and references — may be regenerated |

The authoritative layer determines truth. The advisory layer helps humans understand it.

### 4. Stdout/Stderr Posture

| Aspect | Rule |
|--------|------|
| **Primary truth** | `status` + `metrics` — machine-classified |
| **Secondary** | `stdout_digest` / `stderr_digest` — content-addressed reference |
| **Truncated** | `stdout_excerpt` / `stderr_excerpt` — first 2KB, for quick inspection |
| **Debug-only** | Full stdout/stderr streams — retained for 24h, then eligible for pruning |

Raw stdout/stderr are **not** primary truth. They are retained for debugging and reproducibility, but the canonical result is the classified status and metrics.

### 5. Task-Evidence Linkage

A task verification note **references** a result; it does not **contain** it:

```markdown
## Verification
- Result: `result-uuid-here`
- Status: passed (see canonical record)
- Duration: 14.2s
```

This prevents:
- Duplicated truth between task notes and result store
- Stale verification claims when results are re-run
- Loss of verification history when tasks are closed

### 6. Composition Without Duplication

Multiple results may reference the same task. The task verification surface displays:
- The **latest** result for quick status
- A **history** of results for trend observation
- Never a duplicate of the result content itself

## Consequences

- **Positive**: Request and result have stable, referenceable identities.
- **Positive**: Task notes stay lightweight — they point to results, they don't narrate them.
- **Positive**: Metrics enable trend analysis (flakiness detection, duration regression).
- **Trade-off**: Full stdout/stderr retention requires storage budget; pruning policy needed.
- **Trade-off**: Requires test runners to emit parseable metrics (or fallback to exit-code-only).
