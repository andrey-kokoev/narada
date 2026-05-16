---
status: closed
depends_on: [1385]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T19:39:54.171Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T19:39:54.851Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Define shape of outcome of Remote Candidate Exchange

## Chapter

Site Telemetry Publication

## Goal

Define the desired outcome shape for remote candidate exchange and receipts.

## Context

The hosted message flow must remain candidate state until local Site admission, rejection, or error evidence finalizes it.

## Required Work

1. Define remote candidate exchange outcome artifacts. 2. Specify submit, pending, detail, receipt, finalize, idempotency, retry, and local-admission-reference semantics. 3. Distinguish cloud receipt from local admission. 4. Record residual implementation tasks.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Added `docs/product/site-telemetry-publication-outcome-shapes.md` section `Remote Candidate Exchange`. It defines message, receipt, and finalize outcome artifact families and preserves cloud receipt versus local admission semantics.

## Verification

- Verified the artifact defines submit, pending, detail, receipt, finalize, idempotency, retry, and local-admission-reference semantics.
- Verified it states cloud receipt is not local admission and finalize capability is separate.

## Acceptance Criteria

- [x] Outcome shape defines message and receipt lifecycle.
- [x] Outcome preserves local admission authority.
- [x] Residual implementation tasks are identified without implementing them.
