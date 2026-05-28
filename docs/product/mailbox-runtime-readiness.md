# Mailbox Runtime Readiness

Mailbox runtime readiness is not proven by sync or evaluation alone.

Mailbox source reachability can be modeled as an
[`IncomingMessageIntakeEdge`](incoming-message-intake-edge.md), but mailbox
source read does not by itself prove approval, outbound handoff, draft/effect
execution, or full runtime readiness.

A mailbox Site is operational only when a governed proposal can travel through approval, outbound handoff, draft/effect execution, and read-back evidence appropriate to its posture.

## Readiness States

| State | Meaning |
| --- | --- |
| `sync_smoke_passed` | Source read, fact admission, and projection refresh can run. No outbound work is proven. |
| `evaluation_smoke_passed` | A charter/evaluation can produce a governed recommendation. No approval or effect boundary is proven. |
| `pending_approval_path_ready` | A `pending_approval` foreman decision can be approved or refused through a governed operator path. |
| `draft_effect_smoke_passed` | A safe `draft_reply` can become an outbound command, the draft worker can create a managed draft, and read-back evidence confirms required fields. |
| `full_runtime_ready` | Sync, evaluation, approval, outbound handoff, draft/effect execution, operator review, send approval where applicable, confirmation, and recovery posture are all proven for the configured operation. |
| `blocked_missing_approval_path` | Sync/evaluation can run, but pending decisions cannot be approved/refused into the outbound boundary. The Site is not runtime-ready. |

`sync_smoke_passed` and `evaluation_smoke_passed` are useful milestones. They must not be reported as full runtime readiness.

## Pending Approval Path

If governance produces a `pending_approval` foreman decision, no outbound command exists yet. The governed operator path is:

```bash
narada approve-pending-decision <decision-id> --by <principal>
```

For `draft_reply`, this materializes a pending outbound command. It does not send mail. The outbound draft worker still owns managed draft creation.

For refusal or rejection, use the configured operator disposition path for the pending decision or record a blocker until refusal is implemented for that decision surface. A Site with approval but no refusal path should not claim `full_runtime_ready`.

## Safe Clarification Draft Case

The minimum readiness proof should include a clarification draft reply with uncertainty:

```text
charter/evaluation: clarification_needed
proposed_action: draft_reply
approval: required
operator path: approve-pending-decision
outbound command: draft_reply / pending
draft worker: creates managed draft
send: not performed
```

Required read-back evidence for the created draft:

- non-empty `to`;
- non-empty `subject`;
- non-empty `reply_to_message_id`;
- draft body present;
- outbound command id linked to the approved decision;
- status remains draft/review posture, not sent.

The proof is intentionally draft-first. A clarification request with uncertainty must be reviewable by the Operator before any send path.

## Doctor And Readiness Reporting

Mailbox or operation doctor surfaces should report approval/effect readiness separately from sync/evaluation readiness.

Required posture:

- If sync and evaluation pass but pending approvals cannot be approved/refused into outbound handoff, report `blocked_missing_approval_path`.
- If `approve-pending-decision` exists but no safe draft worker proof has run, report `pending_approval_path_ready`, not `full_runtime_ready`.
- If a managed draft is created but required read-back fields are missing, report blocked draft/effect readiness.
- If the Site is configured for supervised posture, full readiness requires the approval and review path, not only autonomous send eligibility.

Doctor output should give the next bounded command or proof needed rather than a generic "runtime ready" label.

## Motivating Case

The Staccato mailbox readiness incident showed this gap: upstream sync/evaluation smoke could succeed while the Site remained blocked because a pending approval could not yet be driven into a safe draft/effect handoff path with operator-visible evidence.

Narada proper records this as a product invariant. The Staccato Site does not need to be mutated to preserve the lesson.

## Relationship To Existing Surfaces

| Surface | Role |
| --- | --- |
| `narada approve-pending-decision` | Approves a `pending_approval` decision into a materialized outbound command when the proposed action is materializable. |
| `narada drafts` / `show-draft` | Observes draft-ready outbound commands and review posture. |
| `narada mark-reviewed` | Records operator review without approving send. |
| `narada approve-draft-for-send` | Approves a draft-ready send action for execution. |
| `narada reject-draft` | Cancels a draft-ready outbound command. |
| `narada doctor` / `narada ops` | Should expose readiness state and next bounded action. |

The approval command is not the effect worker. Approval materializes or advances durable intent. Workers own draft creation, send, and confirmation.
