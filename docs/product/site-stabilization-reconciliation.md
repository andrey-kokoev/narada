# Site Stabilization And Posture Reconciliation

Site stabilization is a governed read-only surface for comparing durable Site memory, runtime control-plane truth, and operator/session knowledge.

It exists because a Site can become operationally healthier than its authored memory says, or operationally blocked while old docs still imply readiness. Stabilization makes that mismatch visible and proposes bounded posture updates. It does not silently mutate Site docs, config, tasks, doctrine, runtime state, or external systems.

## Authority Posture

```text
durable Site memory + runtime truth + operator/session evidence
  -> stabilization observation
  -> proposed posture update
  -> separately governed admission or edit
```

The stabilization surface is not a repair worker. It may observe, compare, classify, and recommend. Any mutation remains owned by the relevant Site command, task, inbox, publication, or operator-admission crossing.

## Inputs

| Input Family | Examples | Authority Limit |
| --- | --- | --- |
| Durable Site memory | Site config, governance coordinates, task/chapter state, readiness docs, runbooks, accepted inbox envelopes | Durable memory can be stale. It is not runtime truth by itself. |
| Runtime health | `doctor`, daemon status, operation status, sync freshness, charter reachability, queue health | Runtime success does not update authored posture automatically. |
| Work state | active/open/failed/retryable work items, task lifecycle, dispatch leases, roster/session bindings | Active work blocks quiescence unless explicitly classified. |
| Outbound handoffs | pending approvals, pending outbound commands, draft-ready commands, sent/confirmed/terminal commands | A confirmed handoff is evidence; it is not permission to rewrite durable docs silently. |
| Private substrate | ignored SQLite files, local health files, daemon pid files, logs, temp working state | Private files may inform posture but must not be the only portable evidence. |
| Repository posture | dirty tree, ahead/behind, unexported mutation evidence, unpublished inbox envelopes | Publishability is separate from runtime health. |
| Operator/session knowledge | explicit Operator correction, agent report, external manual action, current residuals | Session knowledge must be recorded as evidence before it changes durable posture. |

## Output Contract

Human output must be compact and bounded. JSON output must expose structured fields without dumping raw runtime state, full draft bodies, transcript-scale logs, or confirmed payload contents by default.

Minimum JSON shape:

```json
{
  "site_ref": "staccato",
  "generated_at": "2026-04-29T00:00:00.000Z",
  "read_only": true,
  "current_health": "healthy",
  "quiescence": "quiescent",
  "durable_memory_posture": "blocked_missing_approval_path",
  "runtime_truth_posture": "draft_effect_smoke_passed",
  "pending_work": 0,
  "pending_effects": 0,
  "confirmed_effects": 1,
  "terminal_failures": 0,
  "repo_publication_posture": "clean_or_not_inspected",
  "private_runtime_files": "observed_bounded",
  "recommended_posture": "operational_quiescent_with_approval_path_residual",
  "residuals": [
    "approval/refusal path not fully documented as Site readiness proof"
  ],
  "proposed_updates": [
    {
      "target": "durable_readiness_memory",
      "action": "amend_posture",
      "from": "blocked_missing_approval_path",
      "to": "operational_quiescent_with_approval_path_residual",
      "requires_governed_admission": true
    }
  ],
  "evidence_refs": [
    "runtime_status_summary",
    "outbound_handoff_counts",
    "operator_session_report"
  ]
}
```

Human output should answer:

1. What is the current runtime health?
2. Is the Site quiescent?
3. What pending work or effects remain?
4. What effects are confirmed or terminal?
5. Does durable memory contradict runtime truth?
6. What posture is recommended?
7. What exact governed update or next command is needed?

## Readiness Vocabulary

| State | Meaning |
| --- | --- |
| `runtime_unknown` | Stabilization could not inspect runtime truth. |
| `durable_memory_stale` | Authored durable memory contradicts newer bounded runtime or operator evidence. |
| `runtime_active` | Work or effects are currently active; the Site is not quiescent. |
| `runtime_failed` | Terminal failures or unhealthy probes require attention. |
| `runtime_quiescent` | Runtime has no active work/effects and no current failures, but durable posture may still be unresolved. |
| `operational_quiescent` | Durable memory and runtime truth agree that the Site is quiescent for its declared operation. |
| `operational_quiescent_with_approval_path_residual` | Runtime is healthy/quiescent and at least one approval/effect path has terminal evidence, but the approval/refusal/readiness posture still needs durable reconciliation. |
| `blocked_stale_durable_memory` | Runtime evidence is usable, but durable memory is stale enough that a governed update is required before readiness can be represented cleanly. |
| `blocked_pending_effects` | Pending approvals, drafts, sends, or other outbound effects remain. |
| `blocked_terminal_failures` | Terminal work or effect failures remain unresolved. |
| `blocked_missing_approval_path` | Evaluation/sync can run, but approvals cannot be governed into effect handoff. |
| `full_runtime_ready` | Durable memory, runtime truth, approval/refusal posture, effect handoff, confirmation, recovery, and publication evidence all agree. |

These states refine, but do not replace, mailbox runtime readiness states. For mailbox-specific proof boundaries, see [`mailbox-runtime-readiness.md`](mailbox-runtime-readiness.md).

## Command Posture

The coherent command family is a read-only Site surface:

```bash
narada sites stabilize <site-id-or-root> --format human
narada sites stabilize <site-id-or-root> --format json
narada sites reconcile-posture <site-id-or-root> --dry-run --format json
```

`stabilize` should inspect and classify. `reconcile-posture --dry-run` should produce proposed updates and evidence references. A future non-dry-run admission must be a separate governed crossing with explicit target, evidence, and operator authority.

The command must not:

- mutate Site docs, config, task state, inbox state, or runtime state;
- create or send drafts;
- mark work handled;
- close tasks;
- publish commits;
- print large raw runtime JSON;
- print full draft bodies or confirmed message payloads by default.

## Checklist Surface

Until the command exists, the manual checklist is:

| Check | Required Observation |
| --- | --- |
| Durable memory | Current readiness claim, task/chapter posture, governance coordinates, known residuals. |
| Runtime health | Doctor/status summary and current daemon/control-plane reachability. |
| Quiescence | Counts of active/open/retryable/failed work items. |
| Pending effects | Counts of pending approvals, pending outbound commands, draft-ready commands, sending commands. |
| Confirmed effects | Counts and ids of confirmed or terminal effect handoffs, without payload dump. |
| Private substrate | Whether ignored DB/log/health files contain relevant evidence that needs export or summary. |
| Publication posture | Whether mutation evidence and readiness updates are committed/exported/pushed as appropriate. |
| Operator residuals | Explicit session-known gaps, manual actions, and next governed update. |

The checklist result is a stabilization observation, not a mutation.

## Fixture: Stale Durable Memory With Advanced Runtime Truth

Input:

```json
{
  "durable_memory_posture": "blocked_missing_approval_path",
  "runtime": {
    "doctor": "healthy",
    "active_work": 0,
    "retryable_work": 0,
    "terminal_failures": 0
  },
  "outbound": {
    "pending_approvals": 0,
    "pending_commands": 0,
    "draft_ready": 0,
    "confirmed_or_terminal": 1,
    "terminal_reason": "sent_by_operator_request_via_graph"
  },
  "operator_session_residuals": [
    "approval/refusal path still not durably represented as full readiness proof"
  ]
}
```

Expected stabilization result:

```json
{
  "read_only": true,
  "current_health": "healthy",
  "quiescence": "quiescent",
  "pending_work": 0,
  "pending_effects": 0,
  "confirmed_effects": 1,
  "recommended_posture": "operational_quiescent_with_approval_path_residual",
  "proposed_updates": [
    {
      "target": "durable_readiness_memory",
      "requires_governed_admission": true
    }
  ]
}
```

This fixture proves the core rule: advanced runtime truth can justify a proposed posture update, but it does not authorize automatic mutation of durable Site memory.

## Motivating Case

The Staccato stabilization episode produced exactly this shape: authored durable Site memory reported blocked upstream and no outbound created, while runtime/control-plane truth showed healthy quiescent state, zero pending handoffs, confirmed handoffs, and a Willem clarification draft terminal reason. The correct Narada response is not to mutate Staccato from Narada proper. It is to preserve the invariant in Narada proper and require future Sites to expose a governed stabilization surface.

## Relationship To Adjacent Surfaces

| Surface | Relationship |
| --- | --- |
| `narada doctor` | Runtime health probe. Does not compare durable memory to runtime truth by itself. |
| `narada status` / `narada ops` | Operational snapshot. Useful input to stabilization. |
| `mailbox-runtime-readiness.md` | Mailbox-specific readiness proof vocabulary. Stabilization composes it with Site memory and publication posture. |
| `site-governance-coordinates.md` | Declares authority locus, evidence locus, readiness phase, embodiments, and federation posture. Stabilization checks whether observed truth still matches those declarations. |
| `site-factorization.md` | Prevents collapse of Site, runtime, clone, repo, and projection while stabilization compares them. |

## Product Rule

```text
Stabilization observes divergence, names residuals, and proposes governed posture updates.
It never repairs, rewrites, publishes, sends, or closes by implication.
```
