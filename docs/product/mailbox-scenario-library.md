# Mailbox Scenario Library

> Compact canonical scenario basis for the mailbox vertical. Each scenario is a safe, synthetic fixture with a defined evaluation character and expected outbound shape.

---

## Scenario Set

| # | Scenario | Fixture | Action Class | Approval Posture | Rationale |
|---|----------|---------|--------------|------------------|-----------|
| 1 | Login / access issue | `support-thread-login-issue` | `draft_reply` | draft-only | Acknowledge issue, ask clarifying questions, verify account details. |
| 2 | Billing question | `support-thread-billing-question` | `draft_reply` | draft-only | Request transaction details, explain next steps, do not promise refund without verification. |
| 3 | Refund request | `support-thread-refund-request` | `draft_reply` | draft-only | Acknowledge receipt, request order evidence, outline policy timeline. Sensitive — never auto-send. |
| 4 | Escalation-worthy complaint | `support-thread-escalation-complaint` | `draft_reply` + escalation | draft-only | Acknowledge severity, flag escalation, do not make commitments beyond charter authority. |
| 5 | Ambiguous request | `support-thread-ambiguous-request` | `draft_reply` | draft-only | Low confidence, ask for specifics, do not assume intent. |

---

## Fixture Shape

All fixtures follow the same normalized message shape:

```json
{
  "conversation_id": "conv-support-<scenario>-001",
  "message_id": "msg-<scenario>-001",
  "subject": "...",
  "from": { "name": "...", "address": "...@external.com" },
  "to": [{ "name": "Support", "address": "help@global-maxima.com" }],
  "body": { "body_kind": "text", "text": "..." },
  "folder_refs": ["inbox"],
  "flags": { "is_read": false, "is_draft": false, "is_flagged": <boolean>, "has_attachments": false }
}
```

Fixtures are stored in:
- `packages/layers/control-plane/test/fixtures/threads/support-thread-<scenario>.json`

---

## Evaluation Character per Scenario

### 1. Login / access issue
- **Confidence**: high
- **Classifications**: `issue_type: login/authentication failure`
- **Proposed action**: Draft reply asking for account email, mentioning password reset history, offering next steps.
- **Escalations**: none

### 2. Billing question
- **Confidence**: high
- **Classifications**: `issue_type: billing inquiry`
- **Proposed action**: Draft reply requesting invoice/transaction ID, confirming review timeline.
- **Escalations**: none

### 3. Refund request
- **Confidence**: medium-high
- **Classifications**: `issue_type: refund request`, `priority: flagged`
- **Proposed action**: Draft reply acknowledging request, asking for photos/order evidence, outlining policy.
- **Escalations**: none (handled within standard support flow)

### 4. Escalation-worthy complaint
- **Confidence**: high
- **Classifications**: `issue_type: service complaint`, `priority: high`, `sentiment: negative`
- **Proposed action**: Draft reply acknowledging impact, stating that escalation is triggered, requesting preferred contact time.
- **Escalations**: `escalations` array populated with `reason: executive_attention_required`

### 5. Ambiguous request
- **Confidence**: low
- **Classifications**: `issue_type: unclear`
- **Proposed action**: Draft reply asking customer to specify product, error message, and steps already tried.
- **Escalations**: none

---

## Outbound Shape per Scenario

| Scenario | `recommended_action_class` | `proposed_actions[0].action_type` | `escalations` | Governance result (`require_human_approval: false`) | Governance result (`require_human_approval: true`) |
|----------|---------------------------|-----------------------------------|---------------|-----------------------------------------------------|-----------------------------------------------------|
| Login issue | `draft_reply` | `draft_reply` | `[]` | `action_created` | `pending_approval` |
| Billing question | `draft_reply` | `draft_reply` | `[]` | `action_created` | `pending_approval` |
| Refund request | `draft_reply` | `draft_reply` | `[]` | `pending_approval` | `pending_approval` |
| Escalation complaint | `draft_reply` | `draft_reply` | `[{ reason: "executive_attention_required" }]` | `action_created` | `pending_approval` |
| Ambiguous request | `draft_reply` | `draft_reply` | `[]` | `escalated` | `escalated` |

**Governance notes:**
- **Low confidence** (`ambiguous request`) is escalated automatically, bypassing both `action_created` and `pending_approval`.
- **Medium confidence with uncertainty flags** (`refund request`) requires approval even when `require_human_approval: false`.
- **High confidence, no flags** (`login`, `billing`, `escalation`) creates an outbound command when approval is off, and stops at `pending_approval` when approval is on.
- No scenario in this basis authorizes autonomous `send_reply`. All proposed actions are `draft_reply`.

---

## Proof Hook

The scenario library is mechanically exercised by:

```bash
pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/integration/live-operation/scenario-library.test.ts"
```

This test proves that each scenario fixture, when evaluated by its scenario-appropriate charter runner, produces the expected `recommended_action_class`, confidence level, escalation state, and foreman resolution outcome.

---

## Safety Rules

- All fixtures use fictional names, domains, and addresses (`@external.com`, `help@global-maxima.com`).
- No real customer data, PII, or proprietary content is included.
- Credit card numbers (if referenced) use test-safe patterns (`ending in 4242`).
- Order IDs are synthetic (`GM-98234`).

---

## Non-Goals

- This is not a synthetic corpus for LLM training.
- This is not a benchmark suite for charter output quality.
- This does not cover non-support verticals (sales, onboarding, etc.).
