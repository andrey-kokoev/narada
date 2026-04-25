---
closes_tasks: [606, 607, 608, 609, 610]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 610 — Testing Intent Implementation Closure

## Status
**Closed** — chapter 606–610 closes with a real, tested Testing Intent Zone implementation.

## What This Chapter Produced

### Task 606 — Testing Intent Command Surface v0

**Files:**
- `packages/layers/cli/src/lib/testing-intent.ts` — Types and helpers
- `packages/layers/cli/src/commands/test-run.ts` — `testRunCommand`, `testRunInspectCommand`, `testRunListCommand`
- `packages/layers/cli/test/commands/test-run.test.ts` — 12 tests

**CLI surface:**
```bash
narada test-run run --cmd "pnpm test:unit" [--task 606]
narada test-run inspect --run-id <id>
narada test-run list [--task <num>] [--limit 20]
```

**Behavior:**
- Creates a durable `run_id` before execution
- Executes command with timeout (focused: default 60s/max 120s; full: default 300s/max 600s)
- Stores result in SQLite with status, exit code, duration, stdout/stderr digests and excerpts
- Full suite requires `ALLOW_FULL_TESTS=1`

### Task 607 — Test Run Persistence Store v0

**Schema:** `verification_runs` table in `task-lifecycle.db`

**Fields:** run_id, request_id, task_id, target_command, scope, timeout_seconds, requester_identity, requested_at, status, exit_code, duration_ms, metrics_json, stdout_digest, stderr_digest, stdout_excerpt, stderr_excerpt, completed_at

**CRUD methods:** `insertVerificationRun`, `updateVerificationRun`, `getVerificationRun`, `listVerificationRunsForTask`, `listRecentVerificationRuns`, `hasVerificationRunsForTask`

### Task 608 — Task Verification Consumes Testing Intent Results

**Files changed:**
- `packages/layers/cli/src/lib/task-governance.ts` — `inspectTaskEvidence` checks SQLite verification runs
- `packages/layers/cli/src/lib/task-projection.ts` — `inspectTaskEvidenceWithProjection` checks SQLite verification runs
- `packages/layers/cli/test/commands/task-evidence.test.ts` — new test proving governed runs count as verification

**Behavior:** A task with a governed verification run in SQLite is classified as `has_verification: true` even without a markdown `## Verification` section.

### Task 609 — Testing Intent Cutover and Old Path Demotion

**Files changed:**
- `packages/layers/cli/src/commands/verify-run.ts` — marked as diagnostic/non-canonical
- `packages/layers/cli/src/commands/verify-suggest.ts` — routes to `test-run run`
- `packages/layers/cli/src/main.ts` — `verify` command description notes it is diagnostic

**Posture:** `narada test-run` is canonical; `narada verify run` is a diagnostic escape hatch.

---

## Settled Doctrine

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Sanctioned CLI path exists for governed test runs | ✅ | `narada test-run run|inspect|list` |
| Request surface produces durable run identifier | ✅ | `run_id` returned and stored in SQLite |
| Request/execute/inspect not collapsed | ✅ | Separate commands with durable artifact |
| Governed test runs durably persisted | ✅ | `verification_runs` table |
| Timeout/success/failure distinguishable | ✅ | `status` column: passed/failed/timed_out/blocked/invalid_request |
| Elapsed timing stored authoritatively | ✅ | `duration_ms` |
| Task verification consumes testing-intent results | ✅ | `inspectTaskEvidence` checks SQLite runs |
| Old shell path demoted | ✅ | `verify run` marked diagnostic; `test-run` canonical |
| Tests exist and pass | ✅ | 12 test-run tests + 1 task-evidence test |

---

## Deferred Risks

| Risk | Rationale | Destination |
|------|-----------|-------------|
| Test spawn overhead (~16s in vitest) | `spawn({ shell: true })` environment friction | Follow-up task if it blocks CI |
| Retry and queue policy | v0 executes immediately; no queue | Future scheduling chapter |
| Distributed runner routing | v0 is local-only | Future multi-site chapter |
| Live-test credential sandboxing | Not needed for v0 focused tests | Cloudflare/remote chapter |

---

## Closure Statement

Chapter 606–610 closes with a real Testing Intent Zone that can request, execute, persist, and inspect governed test runs. Task verification surfaces now consume these durable records. The old ad hoc shell path is explicitly demoted. The canonical operator path is `narada test-run run --cmd "<command>" [--task <number>]`.

---

**Closed by:** a3  
**Closed at:** 2026-04-24
