# Cloudflare Effect Execution Authority Contract

> Defines when a Cloudflare Site may attempt a mutating external effect, the exact state transition grammar for outbound commands through execution, and the separation between execution success and confirmation.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
>
> This contract governs Tasks 358–364. No effect-execution worker or Graph adapter may be implemented before this contract is referenced.

---

## 1. Effect-Execution Adapter Meaning

An **effect-execution adapter** is the bounded Site → external mechanical seam that performs a mutating action against an external system (e.g., Microsoft Graph API draft creation, email send, message move).

It is the fifth adapter class, complementing the four live adapters defined in the [Live Adapter Boundary Contract](cloudflare-live-adapter-boundary-contract.md):

| Adapter Class | Direction | Authority | Scope |
|---------------|-----------|-----------|-------|
| source-read | External → Site | Admits facts | Tasks 351–357 |
| charter-runtime | Site → external API | Produces evaluation evidence | Tasks 351–357 |
| reconciliation-read | External → Site | Provides observations | Tasks 351–357 |
| operator-control | Operator → Site | Audits mutations | Tasks 351–357 |
| **effect-execution** | **Site → external** | **Performs approved effects** | **Tasks 358–364** |

An effect-execution adapter is **not** an authority source. It may only attempt effects that have already passed through:

1. Evaluation (charter produces evidence)
2. Decision (foreman creates governed decision)
3. Handoff (outbound command is durably recorded)
4. Operator approval (operator action transitions command to `approved_for_send`)

---

## 2. First Allowed Effect Path

The first allowed effect path is **`send_reply` via Microsoft Graph draft/send**.

**Why this effect is first:**

1. **Bounded scope:** One reply to one message. No batching, no threading complexity, no multi-recipient ambiguity.
2. **Clear draft-first boundary:** Graph API supports `POST /me/messages` (draft creation) followed by `POST /me/messages/{id}/send`. This two-stage flow mirrors Narada's existing "draft-first, confirm-second" invariant.
3. **Existing data flow:** The mailbox vertical already produces `mail.message_created` facts, `send_reply` evaluations, and `send_reply` outbound commands in fixture tests.
4. **Confirmation signal is observable:** A sent reply appears in the Sent Items folder with traceable `internetMessageId`, enabling the live reconciliation adapter to confirm it.
5. **Failure modes are well-understood:** Graph returns explicit error codes for auth failures (401), rate limits (429), and permission errors (403). Transient vs. permanent classification is feasible.

**Blocked effect paths (for this chapter):**

- `send_new_message` — requires recipient validation, attachment handling, and reply-chain management. Defer until `send_reply` is proven.
- `move_message` — requires folder ID resolution and idempotency across moves. Defer.
- `mark_read` — trivial but provides less value per unit of complexity than `send_reply`.
- `set_categories` — requires category ID resolution and multi-value idempotency. Defer.

---

## 3. Approved Command Eligibility

An outbound command is **eligible for execution** if and only if **all** of the following are true:

1. The command's `status` is exactly `approved_for_send`.
2. The command's `action_type` is in the allowed set for this chapter: `{"send_reply"}`.
3. The command has not been previously attempted in a non-retryable terminal state.
4. The Site's health status is not `auth_failed`.

**Commands that are NOT eligible:**

| Status | Reason |
|--------|--------|
| `pending` | No operator approval. Handoff alone does not authorize execution. |
| `draft_ready` | Operator has not approved. Approval is the explicit `approve` action. |
| `cancelled` | Explicitly rejected by operator. |
| `failed_terminal` | Terminal failure. Operator must retry or recreate. |
| `confirmed` | Already confirmed. No further action needed. |

---

## 4. State Transition Grammar

The `outbound_commands` status field follows a strict state machine:

```
                        ┌─────────────────┐
                        │    operator     │
     ┌──────────────────│    approve      │◄────────────────┐
     │                  └─────────────────┘                 │
     │                           │                          │
     ▼                           ▼                          │
┌─────────┐              ┌──────────────┐                   │
│ pending │─────────────►│ draft_ready  │───────────────────┘
└─────────┘   handoff    └──────────────┘    (loop back on
     │                                              retry)
     │ operator reject
     ▼
┌───────────┐
│ cancelled │
└───────────┘

┌─────────────────┐         attempt          ┌─────────────┐
│ approved_for_   │─────────────────────────►│  attempting │
│     send        │                          └─────────────┘
└─────────────────┘                                │
                                                   │
              ┌────────────────────────────────────┼────────────────────┐
              │                                    │                    │
              ▼                                    ▼                    ▼
      ┌─────────────┐                    ┌────────────────┐   ┌─────────────────┐
      │  submitted  │                    │failed_retryable│   │ failed_terminal │
      │ (Graph ack) │                    │  (transient)   │   │  (permanent)    │
      └─────────────┘                    └────────────────┘   └─────────────────┘
              │                                    │                    │
              │ reconcile                          │ retry              │ terminal
              │ confirms                           │ (operator or       │ (operator
              ▼                                    │  scheduler)        │  must act)
      ┌─────────────┐                             │                    │
      │  confirmed  │◄────────────────────────────┘                    │
      └─────────────┘                                                  │
                                                                       ▼
                                                              ┌─────────────┐
                                                              │   (dead)    │
                                                              └─────────────┘
```

### Transition Definitions

| From | To | Trigger | Actor |
|------|----|---------|-------|
| `pending` | `draft_ready` | Handoff creates outbound from approved decision | Foreman/Handoff |
| `draft_ready` | `approved_for_send` | Operator `approve` action succeeds | Operator |
| `draft_ready` | `cancelled` | Operator `reject` action succeeds | Operator |
| `approved_for_send` | `attempting` | Effect worker picks up command and begins API call | Effect Worker |
| `attempting` | `submitted` | External API accepts the effect (Graph returns 201/202) | Effect Worker |
| `attempting` | `failed_retryable` | Transient error (network timeout, 429 rate limit, 503 unavailable) | Effect Worker |
| `attempting` | `failed_terminal` | Permanent error (401 auth, 403 permission, 400 bad request, invalid payload) | Effect Worker |
| `failed_retryable` | `approved_for_send` | Operator `retry` action or scheduler retry policy resets | Operator/Scheduler |
| `failed_retryable` | `cancelled` | Operator `cancel` action | Operator |
| `submitted` | `confirmed` | Live reconciliation observes the effect in external state | Reconciliation Adapter |
| `submitted` | `failed_terminal` | External observation shows effect was never applied (e.g., Graph returned error after initial accept) | Reconciliation Adapter |

### Key Invariants

- **`approved_for_send` is the only entry gate to execution.** No status may transition to `attempting` except from `approved_for_send`.
- **`attempting` is ephemeral and must not persist across worker invocations.** If a worker crashes while `attempting`, the next worker scan must treat the command as `approved_for_send` and re-attempt. This requires either:
  - A short-lived `attempting` lease with TTL, or
  - An `execution_attempts` table that records the attempt while leaving the command in `approved_for_send` until the attempt completes.
- **`submitted` is not `confirmed`.** A command may stay `submitted` indefinitely until reconciliation observes it or observes its absence.
- **`cancelled` and `failed_terminal` are terminal.** No transitions out except via operator retry (which creates a new command or resets via explicit action).

---

## 5. Execution Attempt Evidence

Every execution attempt must leave a durable trace. The canonical trace is an **`execution_attempt`** record:

```
execution_attempt_id  TEXT PRIMARY KEY
outbound_id           TEXT NOT NULL
attempted_at          TEXT NOT NULL
status                TEXT NOT NULL  -- "attempting" | "submitted" | "failed_retryable" | "failed_terminal"
error_code            TEXT           -- HTTP status or Graph error code
error_message         TEXT           -- Human-readable error detail
response_json         TEXT           -- Raw API response (sanitized)
worker_id             TEXT           -- Identity of the worker that attempted
lease_expires_at      TEXT           -- TTL for "attempting" lease
```

**Rules:**

1. Insert `execution_attempt` with `status: "attempting"` **before** calling the external API.
2. Update to `status: "submitted"` **after** the external API returns success.
3. Update to `status: "failed_retryable"` or `failed_terminal"` **after** the external API returns failure or the attempt times out.
4. The `outbound_commands` row must be updated atomically with the `execution_attempt` row.
5. A worker may only attempt an outbound if no unreleased `attempting` lease exists for it.

---

## 6. Retry / Terminal Failure Semantics

### Retryable Failures

The following Graph API errors are **retryable**:

| Condition | HTTP Status | Retry Strategy |
|-----------|-------------|----------------|
| Rate limit | 429 | Exponential backoff: 2s, 4s, 8s, max 60s. Respect `Retry-After` header. |
| Service unavailable | 503 | Exponential backoff, max 3 attempts per worker invocation. |
| Network timeout | No response | Immediate retry once per invocation; otherwise defer to next cycle. |
| Gateway timeout | 504 | Treat as retryable, max 3 attempts. |

### Terminal Failures

The following errors are **terminal** (no automatic retry):

| Condition | HTTP Status | Required Action |
|-----------|-------------|-----------------|
| Authentication failure | 401 | Transition Site health to `auth_failed`. Notify operator. |
| Permission denied | 403 | Terminal. Operator must review Graph app permissions. |
| Bad request | 400 | Terminal. Payload is malformed (e.g., missing recipient, invalid ID). |
| Resource not found | 404 | Terminal if the referenced message/thread no longer exists. |
| Payload too large | 413 | Terminal. Operator must reduce attachment size or split message. |

### Retry Limits

- **Per-attempt retry:** Max 3 attempts within one worker invocation for retryable errors.
- **Per-command retry:** Max 5 total `execution_attempt` rows with `status = "failed_retryable"` before automatic promotion to `failed_terminal`.
- **Operator override:** An operator may `retry` a `failed_terminal` command by transitioning it back to `approved_for_send`. This resets the attempt counter.

---

## 7. Confirmation Separation

**Execution success does not equal confirmation.**

An outbound command reaches `submitted` when the external API accepts the effect. It reaches `confirmed` only when the live reconciliation adapter independently observes the effect in external state.

| Event | What It Means | What It Does NOT Mean |
|-------|---------------|----------------------|
| Graph returns 201 for draft creation | The draft was created | The draft will be sent, will arrive, or is correct |
| Graph returns 202 for send | The send was accepted | The message was delivered, is in the sent folder, or has the right content |
| Worker reports success | The API call completed | The effect is durable, observable, or correct |

**Confirmation is exclusively the reconciliation adapter's responsibility.**

The reconciliation adapter:
- Calls read-only Graph APIs (Sent Items, message headers)
- Matches observations against `submitted` outbounds by `internetMessageId` or injected header
- Transitions matching outbounds to `confirmed`
- Never transitions outbounds to `confirmed` based on execution attempt success

---

## 8. Forbidden Shortcuts

The following shortcuts are **explicitly forbidden** by this contract. No worker, adapter, handler, or document in Tasks 358–364 may implement or claim them:

### 8.1 Evaluator-Driven Execution

A charter evaluator may produce `proposed_actions`. It may **not** cause an effect to execute. The path from evaluation to execution must pass through: decision → handoff → operator approval → effect worker → external API.

### 8.2 Decision-Driven Execution Without Durable Command

A foreman decision may approve an action. It may **not** trigger execution directly. An `outbound_command` row must exist before any effect worker may attempt execution.

### 8.3 Pending or Draft-Ready Execution Without Approval

An effect worker may only attempt commands in `approved_for_send` status. Commands in `pending` or `draft_ready` may not be executed, even if the operator is "sure" or the charter is "confident."

### 8.4 API Success as Confirmation

A 201/202 response from Graph, a success callback, or a worker's own success report may **not** transition an outbound to `confirmed`. Only the reconciliation adapter may confirm, and only against external observation.

### 8.5 Autonomous Send Claims

No document, test comment, or UI label may claim "Narada sends email automatically." The correct phrasing is: "Narada drafts a reply, proposes it for operator approval, and executes the send only after explicit approval."

### 8.6 Production-Readiness Claims

No task in this chapter may claim production readiness. A bounded `send_reply` proof through mocked or real Graph API is **not** production deployment. Credential rotation, egress policy, rate-limit handling, and operational monitoring remain deferred.

---

## 9. No-Overclaim Language

Documents, tests, and comments in Tasks 358–364 must use bounded language:

| Instead of… | Use… |
|-------------|------|
| "Narada sends email" | "Narada drafts a reply; operator approves; worker executes the send" |
| "confirmed by success" | "submitted to Graph; confirmed by reconciliation observation" |
| "automatic send" | "governed send with operator approval gate" |
| "real email delivery" | "Graph API accepted the send request" |
| "production ready" | "bounded effect-execution proof" |
| "draft created" (as confirmation) | "draft submitted to Graph; confirmation requires observation" |

---

## 10. Task Reference

| Task | Contract Reference |
|------|-------------------|
| 358 | This document |
| 359 | §4 (state transitions), §5 (execution attempt evidence), §6 (retry semantics) |
| 360 | §2 (first allowed effect), §6 (Graph error classification) |
| 361 | §5 (execution attempt schema), §6 (retry/terminal failure) |
| 362 | §7 (confirmation separation) |
| 363 | §3 (eligibility), §4 (transitions), §7 (confirmation) |
| 364 | §8 (forbidden shortcuts), §9 (no-overclaim) |

---

## 11. Cross-References

| Document | Relationship |
|----------|--------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace |
| [`docs/deployment/cloudflare-live-adapter-boundary-contract.md`](cloudflare-live-adapter-boundary-contract.md) | Prior adapter taxonomy; effect-execution was out of scope there, in scope here |
| [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) | Cloudflare resource mapping, v0/v1 boundary |
| [`.ai/do-not-open/tasks/20260421-358-364-cloudflare-effect-execution-boundary.md`](../../.ai/do-not-open/tasks/20260421-358-364-cloudflare-effect-execution-boundary.md) | Chapter DAG and closure criteria |
| [`.ai/decisions/20260421-357-cloudflare-live-adapter-spine-closure.md`](../../.ai/decisions/20260421-357-cloudflare-live-adapter-spine-closure.md) | Closure of prior chapter; recommended effect execution as next work |
