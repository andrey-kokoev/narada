---
status: closed
depends_on: [357]
closed: 2026-04-21
---

# Task 358 — Effect Execution Authority Contract

## Context

Task 357 closed live-safe Cloudflare adapters while explicitly blocking effect execution. The next boundary is dangerous: mutating the outside world.

Before implementation, the authority contract must specify exactly when a Cloudflare Site may attempt an effect and what cannot count as confirmation.

## Goal

Define the Cloudflare effect-execution authority contract.

## Required Work

### 1. Create or update deployment doc

Add a document under `docs/deployment/` defining:

- effect-execution adapter meaning
- approved command eligibility
- state transitions
- execution attempt evidence
- failure/retry semantics
- confirmation separation
- no-overclaim language

### 2. Define allowed first effect

Choose the first bounded effect path:

- likely `send_reply` through Graph draft/send, or
- documented blocker proof if no coherent effect path exists.

The contract must explain why this effect is first.

### 3. Define forbidden shortcuts

Explicitly forbid:

- evaluator-driven execution
- decision-driven execution without durable command
- `pending` or `draft_ready` execution without approval
- API success as confirmation
- autonomous send claims

### 4. Update chapter task references

Ensure Tasks 359–364 reference or align with the contract.

## Non-Goals

- Do not implement the worker.
- Do not call Graph.
- Do not create generic execution abstraction.
- Do not claim production readiness.
- Do not create derivative task-status files.

## Execution Notes

**Contract document:** `docs/deployment/cloudflare-effect-execution-authority-contract.md` (17.9 KB, 11 sections)

**First allowed effect path:** `send_reply` via Microsoft Graph draft/send. Selected for bounded scope, clear draft-first boundary, existing data flow, observable confirmation signal, and well-understood failure modes.

**State transition grammar:** 10-status state machine with explicit transitions, triggers, and actors. ASCII diagram included. Key invariants: `approved_for_send` is the only execution entry gate; `attempting` is ephemeral; `submitted` ≠ `confirmed`.

**Forbidden shortcuts documented:** Evaluator-driven execution, decision-driven execution without durable command, pending/draft_ready execution without approval, API success as confirmation, autonomous send claims, production-readiness claims.

**Artifacts updated:** None beyond the contract document (document-only task per non-goals).

**Verification:**
- `pnpm verify` — 5/5 pass
- Textual review confirms no overclaim language, no production readiness claims, no autonomous send claims

## Acceptance Criteria

- [x] Effect-execution authority contract exists.
- [x] First allowed effect path is selected or blocked.
- [x] State transition grammar is explicit.
- [x] Confirmation separation is explicit.
- [x] No-overclaim language is explicit.
- [x] No derivative task-status files are created.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
