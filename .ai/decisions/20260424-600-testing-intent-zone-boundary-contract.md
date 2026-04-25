---
closes_tasks: [600]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 600 — Testing Intent Zone Boundary Contract

## Status
**Accepted** — defines the canonical boundary for Narada's Testing Intent Zone.

## Context
Testing in Narada currently spans ambiguous roles: shell commands, `pnpm verify` output, task verification prose, and focused script recordings. None of these are governed as a single zone. This decision removes that ambiguity by defining the irreducible objects, zones, and authority ownership.

## Decision

### 1. Irreducible Objects

| Object | Definition | Authority |
|--------|-----------|-----------|
| **VerificationRequest** | A durable intent to execute a specific verification unit under declared posture | Requester (operator or agent) |
| **GovernedTestExecution** | The bounded, supervised run of the requested verification unit | Execution regime (scheduler/runtime) |
| **VerificationResult** | The terminal, durable record of what happened during execution | Result store (SQLite) |

No single object may be collapsed into another. A shell process is not a result. A task note is not a request.

### 2. Zones and Crossings

```
┌─────────────┐     request envelope      ┌──────────────────┐
│   Source    │ ────────────────────────> │   Execution      │
│  (requester)│                           │   (runner)       │
└─────────────┘                           └──────────────────┘
                                                 │
                                                 │ result envelope
                                                 ▼
                                        ┌──────────────────┐
                                        │   Destination    │
                                        │  (result store)  │
                                        └──────────────────┘
```

| Zone | Owner | Invariant |
|------|-------|-----------|
| **Source** | Requester (operator or agent) | Request must be explicit, admissible, and durable before execution begins |
| **Execution** | Scheduler / runtime | Execution is bounded by timeout, environment, and retry policy declared in the request |
| **Destination** | SQLite result store | Result is append-only and canonical once committed; no mutation after commit |

### 3. Crossing Artifacts

| Crossing | Artifact | Direction |
|----------|----------|-----------|
| Source → Execution | `VerificationRequest` envelope | One-way, durable before handoff |
| Execution → Destination | `VerificationResult` envelope | One-way, atomic commit |

### 4. Admissibility Regime

A request is admissible only if:

1. The target command is known to the regime (registered verification unit).
2. The requester has authority for the requested scope (focused vs full).
3. The environment posture matches the request's declared assumptions.
4. The request is not a duplicate of an in-flight request for the same target.

### 5. Confirmation Law

Once a `VerificationResult` is committed to the destination store:

- It is the **single canonical truth** for that verification run.
- It may be **referenced** by task verification notes, but never **duplicated** into them.
- It may be **projected** into UI or reports, but projections are non-authoritative.

### 6. Authority Ownership

| Concern | Owner | Rationale |
|---------|-------|-----------|
| Whether a test may run | Admissibility regime (policy) | Prevents arbitrary/unbounded execution |
| Timeout | Execution regime (runtime), bounded by request | Runtime enforces; request declares expectation |
| Environment posture | Execution regime (runtime), validated against request | Ensures reproducibility |
| Retry policy | Execution regime (config), overrideable by operator | Centralized policy prevents retry storms |
| Persistence of result | Result store (SQLite) | Durable boundary; append-only |

### 7. What Testing Is NOT

Testing in this regime is **not**:

- Merely raw shell output — shell output is a crossing artifact, not the result.
- Merely chat narration — narration is advisory, not canonical.
- Merely task-note prose — task notes reference results, they do not replace them.

### 8. Main Collapse Prevented

This boundary prevents the **"shell output = verification truth"** collapse. Without it, an operator or agent could claim verification passed based on a transient transcript, with no durable record, no timing, no classification, and no linkage to the task that requested it.

## Consequences

- **Positive**: Verification becomes a governed, auditable zone with explicit objects and authority.
- **Positive**: Task verification notes can reference canonical results instead of narrating them.
- **Trade-off**: Adds a small overhead (request envelope, result commit) to every verification run.
- **Trade-off**: Requires a result store (SQLite) adjacent to the existing task lifecycle store.
