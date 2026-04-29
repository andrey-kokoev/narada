# Site Posture And Work-Next

Site posture is the bounded operator-facing summary of whether a Site is healthy, quiescent, blocked, or ready for a next action.

Site work-next is the bounded operator-facing selection of the next Site action across health, runtime readiness, task/inbox work, drafts, failures, residuals, and publication posture.

They exist because routine Site operation should not require manually reconciling `doctor`, `ops`, `status`, `drafts`, task work-next, inbox work-next, and Site-specific wrapper scripts.

## Separation From Agent Task Execution

Site posture and Site work-next are Operator surfaces.

They do not replace:

- `narada task work-next` for agent task execution;
- `narada task peek-next` / `pull-next` for task lifecycle work;
- `narada inbox work-next` for Canonical Inbox handling;
- `narada ops` for operation dashboard detail;
- `narada doctor` for low-level health probes.

They compose bounded summaries from those surfaces without smearing agent execution into Operator Site posture.

## Command Posture

Canonical command names:

```bash
narada site posture <site-id-or-root> --format human
narada site posture <site-id-or-root> --format json
narada site work-next <site-id-or-root> --format human
narada site work-next <site-id-or-root> --format json
```

Compatibility aliases may live under `narada sites posture` / `narada sites work-next` if the existing CLI group remains plural. Local Site wrappers should delegate to this canonical surface and may only add Site-local defaults such as `--site-root`.

## Site Posture Output

The posture command summarizes:

| Field | Meaning |
| --- | --- |
| `site_ref` | Site id, root, or routing coordinate inspected. |
| `generated_at` | Observation time. |
| `daemon_posture` | Running, stopped, unreachable, not_configured, or unknown. |
| `sync_freshness` | Fresh, stale, never_synced, not_applicable, or unknown. |
| `runtime_readiness` | Staged readiness such as `sync_smoke_passed`, `draft_effect_smoke_passed`, `operational_quiescent_with_approval_path_residual`, or `blocked_missing_approval_path`. |
| `work_queue` | Bounded counts for active, retryable, stuck, and failed-terminal work. |
| `drafts` | Bounded counts for pending approval, pending outbound, draft-ready, sending, confirmed, and cancelled/terminal. |
| `inbox` | Bounded counts for received, claimed, promoted, pending, archived. |
| `tasks` | Bounded counts for opened, claimed, in_review, closed-needing-confirmation, blocked. |
| `publication` | Dirty, unexported, unpushed, clean, or unknown. |
| `residuals` | Bounded list of known posture residuals. |
| `next_action` | One recommended operator action or `none`. |

Required JSON shape:

```json
{
  "site_ref": "staccato",
  "generated_at": "2026-04-29T00:00:00.000Z",
  "posture": "healthy_quiescent_with_residual",
  "daemon_posture": "running",
  "sync_freshness": "fresh",
  "runtime_readiness": "operational_quiescent_with_approval_path_residual",
  "work_queue": {
    "active": 0,
    "retryable": 0,
    "stuck": 0,
    "failed_terminal": 0
  },
  "drafts": {
    "pending_approval": 0,
    "pending_outbound": 0,
    "draft_ready": 0,
    "sending": 0,
    "confirmed_or_terminal": 1
  },
  "inbox": {
    "received": 0,
    "claimed": 0,
    "promoted": 0
  },
  "tasks": {
    "opened": 0,
    "claimed": 0,
    "in_review": 0
  },
  "publication": "clean",
  "residuals": [
    "approval/refusal path readiness still needs durable reconciliation"
  ],
  "next_action": {
    "kind": "reconcile_posture",
    "command": "narada site stabilize staccato --format json",
    "reason": "Runtime is quiescent but durable readiness memory has residuals."
  },
  "output_bounds": {
    "raw_transcripts_included": false,
    "raw_db_rows_included": false,
    "draft_payloads_included": false
  }
}
```

Human output should fit on one screen and name the next command. It must not dump transcripts, full task bodies, raw SQLite rows, full draft bodies, or large status JSON.

## Site Work-Next Selection

`site work-next` returns one bounded Operator action.

Priority order:

1. `fix_health`: daemon unreachable, missing runtime, broken credentials, or doctor fail.
2. `handle_failed_terminal`: failed-terminal work/effect requires Operator attention.
3. `handle_retryable_or_stuck`: retryable/stuck work needs recovery or reconciliation.
4. `review_draft_or_pending_approval`: draft-ready or pending approval exists.
5. `process_inbox`: received or claimed inbox work exists and is admissible.
6. `process_task_review`: task in review needs review/closure.
7. `continue_active_task`: claimed task belongs to a live Builder/Architect role.
8. `reconcile_posture`: runtime truth and durable memory diverge.
9. `publish_evidence`: portable inbox/task/evidence artifacts are uncommitted or unpushed.
10. `none`: Site is quiescent and no actionable residual remains.

The command must return the selected action, reason, bounded command, authority posture, and whether the action mutates.

Example:

```json
{
  "status": "success",
  "site_ref": "staccato",
  "action": {
    "kind": "review_draft_or_pending_approval",
    "label": "Review pending clarification draft",
    "command": "narada drafts --format human",
    "mutating": false,
    "authority_posture": "operator_review_required",
    "reason": "1 draft_ready outbound command is pending review."
  },
  "alternatives_count": 3,
  "output_bounds": {
    "raw_transcripts_included": false,
    "raw_payloads_included": false
  }
}
```

## Local Wrapper Rule

Site-local scripts may expose friendly names:

```bash
staccato posture
staccato work-next
narada-sonar posture
narada-sonar work-next
```

Those wrappers must be thin projections:

```text
local wrapper -> narada site posture/work-next --site-root <local-site-root>
```

They must not:

- implement independent readiness policy;
- reorder action priority without declaring a Site-local overlay;
- print larger raw outputs than the canonical command;
- mutate state as part of posture inspection.

## Fixture: Healthy Quiescent Site

Input summary:

```json
{
  "doctor": "healthy",
  "daemon": "running",
  "sync_freshness": "fresh",
  "work_queue": { "active": 0, "retryable": 0, "stuck": 0, "failed_terminal": 0 },
  "drafts": { "pending_approval": 0, "draft_ready": 0, "sending": 0 },
  "inbox": { "received": 0 },
  "tasks": { "opened": 0, "in_review": 0 },
  "publication": "clean",
  "residuals": []
}
```

Expected work-next:

```json
{
  "action": {
    "kind": "none",
    "label": "No Site action required",
    "mutating": false
  }
}
```

## Fixture: Pending Draft Attention

Input summary:

```json
{
  "doctor": "healthy",
  "daemon": "running",
  "sync_freshness": "fresh",
  "work_queue": { "active": 0, "retryable": 0, "stuck": 0, "failed_terminal": 0 },
  "drafts": { "pending_approval": 0, "draft_ready": 1, "sending": 0 },
  "inbox": { "received": 0 },
  "tasks": { "opened": 0, "in_review": 0 },
  "publication": "clean",
  "residuals": []
}
```

Expected work-next:

```json
{
  "action": {
    "kind": "review_draft_or_pending_approval",
    "command": "narada drafts --format human",
    "mutating": false,
    "authority_posture": "operator_review_required"
  }
}
```

## Fixture: Failed-Terminal Attention

Input summary:

```json
{
  "doctor": "healthy",
  "daemon": "running",
  "sync_freshness": "fresh",
  "work_queue": { "active": 0, "retryable": 0, "stuck": 0, "failed_terminal": 1 },
  "drafts": { "pending_approval": 0, "draft_ready": 0, "sending": 0 },
  "inbox": { "received": 0 },
  "tasks": { "opened": 0, "in_review": 0 },
  "publication": "clean",
  "residuals": []
}
```

Expected work-next:

```json
{
  "action": {
    "kind": "handle_failed_terminal",
    "command": "narada ops --format human",
    "mutating": false,
    "authority_posture": "operator_attention_required"
  }
}
```

## Relationship To Site Stabilization

Site posture answers "what is true now?"

Site stabilization answers "where do durable memory, runtime truth, and session knowledge diverge?"

Site work-next answers "what should the Operator do next?"

If posture detects divergence, work-next should recommend stabilization/reconciliation rather than silently mutating durable memory.
