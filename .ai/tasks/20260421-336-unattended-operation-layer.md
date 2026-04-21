---
status: closed
depends_on: [330, 331, 334]
---

# Task 336 — Unattended Operation Layer

## Context

Narada's current operator rhythm (see `docs/product/operator-loop.md`) requires periodic human attention: run sync, check health, review drafts, retry failures. For Narada to be a real grammar rather than a babysat tool, operations must be safe to run without constant operator attention.

The Cloudflare prototype proved that a Site can execute bounded Cycles. It did not prove that a Site can recover from its own failures.

## Goal

Design the unattended operation layer: health monitoring, stuck-cycle detection, operator notification, and graceful restart semantics. Make live operations safe without babysitting.

## Required Work

### 1. Define unattended operation semantics

What does "unattended" mean for Narada?

- **Graceful degradation** — if a Cycle fails, the Site records the failure, releases the lock, and schedules the next Cycle
- **Stuck-cycle detection** — if a Cycle acquires the lock but never releases it (crash, infinite loop), a later Cycle must detect and recover
- **Health decay** — consecutive failures should degrade health status and eventually alert the operator
- **Operator notification** — when a Site needs human attention (terminal failure, auth expiry, repeated sync errors), the operator is notified via a channel they control
- **Restart safety** — restarting the local daemon or redeploying the Cloudflare Worker must not corrupt durable state

### 2. Design stuck-cycle recovery

Document the recovery protocol:

1. A new Cycle begins and attempts to acquire the lock.
2. If the lock is held by a previous Cycle that has exceeded its TTL, the new Cycle considers it stuck.
3. The new Cycle releases the stale lock, records a stuck-cycle Trace, and proceeds.
4. The operator is notified that a stuck cycle was recovered.

This protocol must work for both local SQLite locks and Cloudflare DO locks.

### 3. Design health alerting thresholds

Define health status transitions:

| Condition | Health Status | Operator Action |
|-----------|---------------|-----------------|
| 0 consecutive failures, all steps complete | `healthy` | None |
| 1–2 consecutive failures, partial steps | `degraded` | Review at next scheduled check |
| 3+ consecutive failures or stuck cycle | `critical` | Alert operator immediately |
| Auth failure (401 from Graph API) | `auth_failed` | Alert operator; do not retry until auth fixed |

### 4. Design notification surface

The notification surface must be:
- **Pluggable** — email, Slack, webhook, or local OS notification
- **Rate-limited** — do not spam the operator
- **Actionable** — every notification includes a link or instruction to resolve
- **Non-blocking** — notification failure does not stop the Cycle

For v0, a simple webhook or log-based notification is sufficient.

## Non-Goals

- Do not build a full observability platform (metrics, dashboards, tracing).
- Do not implement auto-remediation without human oversight.
- Do not create a public alerting service.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Unattended operation design documented.
- [x] Stuck-cycle recovery protocol defined and works for both local and Cloudflare substrates.
- [x] Health alerting thresholds defined with clear operator actions.
- [x] Notification surface is pluggable and rate-limited.
- [x] At least one failure mode (stuck cycle) has a documented recovery path.
- [x] No implementation code was added.

## Execution Notes

Design document created: [`docs/product/unattended-operation-layer.md`](../../docs/product/unattended-operation-layer.md)

Covers: stuck-cycle recovery protocol (§2), health status transitions and state machine (§3), notification surface with rate-limiting (§4), restart safety for local and Cloudflare substrates (§5), and a complete failure mode matrix (§6).

## Suggested Verification

Manual inspection of `docs/product/unattended-operations.md`. No code to verify.
