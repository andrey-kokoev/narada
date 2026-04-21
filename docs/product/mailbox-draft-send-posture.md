# Mailbox Draft/Send Posture

> **Scope**: Recommended draft and send behavior for daily use of the mailbox vertical.  
> **Audience**: Operators configuring and running Narada mailbox operations.  
> **Last updated**: 2026-04-20

---

## Principles

### 1. Always Draft First

Narada enforces **Draft-First Delivery** (AGENTS.md Invariant 32). Charters and workers never send directly; they always create a Graph draft first. This means:

- Every external-facing reply exists as a draft before it is sent.
- The operator can inspect, edit, or reject the draft before it leaves the Site.
- If the charter runtime errors or proposes nonsense, the error is contained in a draft — never in a sent message.

**Implementation:** The `send_reply` worker creates a `ManagedDraft` bound to an `outbound_command` version. Pre-send verification hashes the body, recipients, subject, and `X-Outbound-Id` header. Any mismatch → `failed_terminal`.

### 2. Human Review for High-Stakes

External-facing replies to customers, partners, or regulated channels should require explicit operator approval. This is the **supervised posture** and is recommended for all customer-support operations.

**What counts as high-stakes:**
- First reply to a new customer
- Refund, billing, or legal-adjacent content
- Escalation or complaint responses
- Any context where the charter confidence is below threshold

**How to enforce:** Set `require_human_approval: true` in scope config. The foreman will create `outbound_command` rows in `draft_ready` status. The operator must explicitly approve before the worker transitions to `sending`.

### 3. Auto-Send for Low-Stakes

Routine, low-risk acknowledgments may bypass human review if the operator chooses. Examples:
- Auto-acknowledgment of receipt to an internal alias
- Routine "we received your request" templated replies
- Known, high-confidence responses to recurring question types

**How to enable:** Set `require_human_approval: false` in scope config **and** include `send_reply` or `send_new_message` in `allowed_actions`.

**Warning:** Auto-send removes the review gate. Use only for internal or fully automated workflows. Do not use for customer-facing support without extensive testing.

### 4. Batch Review

Operators should review all drafts produced in a single Cycle in one session. This is more efficient than interrupt-driven review after every draft, and it gives the operator context on the charter's behavior across multiple contexts.

**Recommended workflow:**
1. Run `narada ops` to see the full Drafts Pending Review list.
2. Inspect drafts in batch: `narada show-draft <outbound-id>` for each.
3. Disposition all drafts: approve, reject, or mark-reviewed.
4. Run `narada ops` again to confirm the queue is clear.

---

## Policy Fields

Draft/send behavior is controlled by two config fields under `charter`:

| Field | Type | Description |
|-------|------|-------------|
| `require_human_approval` | `boolean` | If `true`, every send action requires operator approval before the outbound worker executes it. |
| `allowed_actions` | `Array<"draft_reply" \| "send_reply" \| "send_new_message" \| "mark_read" \| "move_message" \| "set_categories">` | Which actions the charter is permitted to propose. |

### The `require_human_approval` Field

- When `true`: The foreman creates `outbound_command` in `draft_ready`. The operator must promote it to `approved_for_send` via `narada approve-draft-for-send` or the operator action surface.
- When `false`: The foreman creates `outbound_command` in `approved_for_send` directly. The outbound worker will send without waiting for operator action.
- This field applies only to `send_reply` and `send_new_message`. Non-send actions (`mark_read`, `move_message`, `set_categories`) do not require human approval regardless of this flag.

### The `allowed_actions` Field

This is the **capability envelope** for the charter. Even if `require_human_approval` is `false`, the charter cannot propose actions not listed here.

---

## Recommended Postures

### Posture A: Supervised (Recommended for Daily Use)

```json
{
  "charter": {
    "require_human_approval": true,
    "allowed_actions": ["draft_reply", "mark_read", "move_message"]
  }
}
```

- Charters propose drafts and non-send actions only.
- **Every send requires explicit operator approval.**
- No autonomous external-facing communication.
- Best for: Most operations, especially those handling sensitive or complex support.

**Operator rhythm:** Morning batch-review of drafts; approve sends individually or in small groups.

---

### Posture B: Semi-Autonomous

```json
{
  "charter": {
    "require_human_approval": true,
    "allowed_actions": ["draft_reply", "send_reply", "send_new_message", "mark_read", "move_message"]
  }
}
```

- Charters may propose complete sends (`send_reply`, `send_new_message`), but the operator must still approve each one.
- The charter prepares the full reply; the operator just clicks approve.
- Best for: High-volume, low-risk operations where the charter is well-tested and the operator wants to batch-review complete proposals.

**Operator rhythm:** Morning batch-review of proposed sends; approve all valid sends in one session.

---

### Posture C: Autonomous (Not Recommended for Daily Use)

```json
{
  "charter": {
    "require_human_approval": false,
    "allowed_actions": ["draft_reply", "send_reply", "send_new_message", "mark_read", "move_message"]
  }
}
```

- Charters draft and send without operator approval.
- The only review surface is after-the-fact (audit log, confirmed messages, `narada audit`).
- Best for: Internal-only or fully automated workflows (e.g., auto-acknowledgments to a monitored alias).

**Warning:** Do not use for customer-facing support without extensive testing and a mature knowledge base.

---

### Consistency Rule

`require_human_approval: false` with `allowed_actions` that does **not** include `send_reply` or `send_new_message` is a **contradictory configuration**:

- The charter cannot send autonomously (no send actions allowed).
- Yet approval is also disabled (`require_human_approval: false`).
- Result: Drafts are created and sit in `draft_ready` indefinitely because there is no mechanism to promote them.

**Fix:** Either add `send_reply` to `allowed_actions` (if you want auto-send) or set `require_human_approval: true` (if you want manual review).

---

## Degraded Mode: `draft_only`

Narada supports a runtime degraded mode that forces draft-only behavior regardless of config:

```json
{
  "charter": {
    "degraded_mode": "draft_only"
  }
}
```

**Effects:**
- Runtime health reports `degraded_draft_only`.
- `require_human_approval` is forced `true` in runtime policy.
- Charters may only propose `draft_reply`; `send_reply` and `send_new_message` proposals are gated to draft-only.
- The operator must explicitly approve each send.

**Important:** `draft_only` does **not** disable the send execution worker. It prevents charters from proposing sends without approval. If an operator manually approves a draft for send while in `draft_only`, the `SendReplyWorker` will still execute it.

Use `draft_only` during incidents (auth issues, charter misbehavior, external draft mutation suspicion) to ensure no autonomous sends occur.

---

## Lifecycle of a Draft

```
Cycle produces evaluation
        ↓
Foreman resolves → decision
        ↓
OutboundHandoff creates command → draft_ready
        ↓
Operator reviews (narada ops / show-draft)
        ↓
  ┌─────────────────┬─────────────────┐
  ↓                 ↓                 ↓
approve          reject         mark-reviewed
        ↓                 ↓                 ↓
approved_for_send  cancelled      draft_ready (retained)
        ↓
SendReplyWorker sends
        ↓
submitted
        ↓
Inbound reconciliation
        ↓
confirmed
```

Every transition is recorded as a Trace in the outbound store and (for operator actions) in `operator_action_requests`.

---

## Related Documents

- [`docs/product/operator-loop.md`](operator-loop.md) — Canonical five-step operator live loop
- [`docs/product/day-2-mailbox-hardening.md`](day-2-mailbox-hardening.md) — Operational failure modes, recovery drills, and hardening gaps
- [`docs/product/mailbox-terminal-failures.md`](mailbox-terminal-failures.md) — Terminal failures that block or corrupt the draft/send pipeline
- [`docs/concepts/mailbox-knowledge-model.md`](../concepts/mailbox-knowledge-model.md) — How knowledge reaches the charter runtime and shapes draft quality
