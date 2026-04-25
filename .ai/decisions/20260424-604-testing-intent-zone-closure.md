---
closes_tasks: [600, 601, 602, 603, 604]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 604 — Testing Intent Zone Closure

## Status
**Closed** — chapter 600–604 closes with explicit contracts for request, execution, result, and persistence.

## What This Chapter Produced

### Task 600 — Testing Intent Zone Boundary Contract

**Artifact:** `.ai/decisions/20260424-600-testing-intent-zone-boundary-contract.md`

**Settled:**
- Three irreducible objects: `VerificationRequest`, `GovernedTestExecution`, `VerificationResult`
- Three zones: Source (requester), Execution (runner), Destination (result store)
- Crossing artifacts: request envelope, result envelope
- Admissibility regime: known command, permitted scope, matching environment, no duplicates
- Confirmation law: result is append-only and canonical once committed
- Anti-collapse invariant: shell output ≠ verification truth

### Task 601 — Test Run Request And Result Artifact Contract

**Artifact:** `.ai/decisions/20260424-601-test-run-request-and-result-artifact-contract.md`

**Settled:**
- `VerificationRequest` shape: `request_id`, `task_id`, `target_command`, `scope`, `timeout_seconds`, `env_posture`, `requester_identity`, `requested_at`, `rationale`
- `VerificationResult` shape: `result_id`, `request_id`, `status`, `exit_code`, `duration_ms`, `metrics`, `stdout_digest`, `stderr_digest`, `stdout_excerpt`, `stderr_excerpt`, `completed_at`
- Authoritative vs advisory split: status/metrics are truth; excerpts/summaries are convenience
- Stdout/stderr posture: digest + excerpt primary; full stream debug-only
- Task-evidence linkage: tasks reference results by ID, never duplicate content

### Task 602 — Test Execution Regime Contract

**Artifact:** `.ai/decisions/20260424-602-test-execution-regime-contract.md`

**Settled:**
- Admissibility: registered command, permitted scope, matching environment, no duplicate in-flight
- Scope classes: focused (any), full (requires `ALLOW_FULL_TESTS`), forbidden live (requires `LIVE_TEST_OK`)
- Timeout: focused default 60s/max 120s; full default 300s/max 600s; runtime enforces
- Retry: none by default; 1 automatic for known-flaky; operator-only for full suite
- Environment: fixed cwd, checked Node version, fixture/live distinction
- Terminal classifications: `passed`, `failed`, `timed_out`, `blocked`, `invalid_request`

### Task 603 — Verification Run Persistence And Telemetry Contract

**Artifact:** `.ai/decisions/20260424-603-verification-run-persistence-and-telemetry-contract.md`

**Settled:**
- SQLite persistence adjacent to task lifecycle store
- Two tables: `verification_requests` and `verification_results`
- Telemetry: duration/counts/status first-class; full streams incidental
- Retention: full 30 days, summary 90 days, archive summary only
- Task-verification consumption: read-only reference by `result_id`, no duplication
- Raw output: excerpts inline, full streams 24h debug-only

---

## Settled Doctrine

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Testing request/execution/result are distinct objects | ✅ | Decision 600 §1–2 |
| Zone/crossing regime is explicit | ✅ | Decision 600 §2–3 |
| Authority ownership is explicit | ✅ | Decision 600 §6 |
| Anti-collapse invariant is explicit | ✅ | Decision 600 §7–8 |
| Request artifact is explicit | ✅ | Decision 601 §1 |
| Result artifact is explicit | ✅ | Decision 601 §2 |
| Authoritative vs advisory split is explicit | ✅ | Decision 601 §3 |
| Task-evidence linkage posture is explicit | ✅ | Decision 601 §5 |
| Admissibility rules are explicit | ✅ | Decision 602 §1 |
| Focused/full posture is explicit | ✅ | Decision 602 §2 |
| Timeout ownership is explicit | ✅ | Decision 602 §3 |
| Retry posture is explicit | ✅ | Decision 602 §4 |
| Terminal classifications are explicit | ✅ | Decision 602 §6 |
| Persistence posture is explicit | ✅ | Decision 603 §1 |
| Minimum durable record set is explicit | ✅ | Decision 603 §2 |
| Telemetry posture is explicit | ✅ | Decision 603 §3 |
| Task-verification consumption is explicit | ✅ | Decision 603 §5 |
| Raw output retention is explicit | ✅ | Decision 603 §6 |

---

## Deferred Risks

| Risk | Why Deferred | Destination |
|------|-------------|-------------|
| **Registered verification unit list** | Requires codebase audit to enumerate all test entry points | Implementation task (605+) |
| **Known-flaky test registry** | Requires historical run data to identify flakes | After first implementation batch |
| **Full stdout/stderr storage backend** | Debug-only; temp filesystem sufficient for v0 | If debugging pain emerges |
| **Cross-package test isolation** | Assumed by current pnpm workspace; may need enforcement | Future hardening task |
| **Live-test credential sandboxing** | Requires external API sandbox design | Cloudflare/remote chapter |

---

## First Implementation Line

**Task 605** (not yet created) should implement:

1. SQLite schema migration: `verification_requests` and `verification_results` tables.
2. A `VerificationRegime` class that enforces admissibility rules and executes registered units.
3. Integration with `pnpm verify`, `pnpm test:unit`, and focused test paths.
4. A CLI surface: `narada verify --focused <path>` and `narada verify --full` (with guard).

---

## Closure Statement

Chapter 600–604 closes with the Testing Intent Zone fully specified. Request, execution, and result are distinct governed objects with explicit shapes. The execution regime bounds timeout, retry, scope, and environment. Results persist in SQLite with clear retention and telemetry posture. Task verification surfaces will consume results by reference, never by duplication. The first implementation line is the schema migration and `VerificationRegime` class.

---

**Closed by:** a3  
**Closed at:** 2026-04-24
