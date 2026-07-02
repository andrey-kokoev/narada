# NARS Authority Runtime Host Transition

## Purpose

A NARS Authority Runtime Host Transition is the first-class governed operation that changes which host owns canonical NARS authority for a session lineage.

It exists because Narada can project a local NARS session to Cloudflare and can also run a Cloudflare-origin NARS authority slice. Those are not enough, by themselves, to safely move authority between hosts. A transition is the explicit crossing that rehomes `authority_runtime` from one host to another without letting projection freshness, cache durability, transport reachability, or browser state imply authority.

This concept extends the [`Narada Runtime Projection Graph`](narada-runtime-projection-graph.md), the [`NARS Runtime Contract`](nars-runtime-contract.md), [`NARS Session Management`](nars-session-management.md), [`Operator Input Admission`](operator-input-admission.md), and [`Governed Crossing`](governed-crossing.md).

## Core Claim

```text
Switching authority hosts is not a pointer flip.
It is a governed transition between authority runtimes.
```

The operator-facing word may be `switch`, but the canonical Narada object is an authority runtime host transition.

## Terms

| Term | Meaning |
| --- | --- |
| `authority_runtime_host` | The host locus that currently owns canonical NARS runtime authority for a session lineage. Initial values are `local` and `cloudflare-host`. |
| `authority_epoch` | A monotonic generation of runtime authority for the session lineage. Only one epoch may admit canonical writes at a time. |
| `source_authority_runtime` | The current authority runtime before the transition. |
| `target_authority_runtime` | The runtime being prepared to become authority. |
| `handoff_boundary` | The event, queue, artifact, health, and fabric checkpoint that separates source and target responsibility. |
| `fencing` | The mechanism that prevents source and target from both admitting canonical writes. |
| `transition_record` | Durable evidence describing intent, state, checks, fencing, handoff, outcome, and review references. |

## Relationship To Projection Graph

Before a local-to-Cloudflare authority rehome:

```text
local NARS authority_runtime
  -> projection_edge
  -> Cloudflare projection_store
  -> Cloudflare projection_surface
```

After a completed rehome:

```text
Cloudflare NARS authority_runtime
  -> projection_edge
  -> local projection_store
  -> local projection_surface
```

The transition is the operation that changes which node occupies `authority_runtime`. It is not itself a projection edge and it is not an intent route.

Projection stores remain non-canonical unless a transition record admits a target runtime as the new authority. A Cloudflare projection cache cannot become authority just because it is current, durable, public, or reachable.

## Invariants

1. Exactly one authority runtime may admit canonical writes for one session lineage epoch.
2. Authority is not inferred from projection freshness, process liveness, URL reachability, cache durability, or UI attachment.
3. Every host transition has a source epoch and target epoch.
4. The source authority must be fenced, sealed, or drained before the target admits canonical writes.
5. Operator input queue state has explicit transition disposition.
6. Artifact registry and artifact content have explicit transition disposition.
7. Event log cursor and canonical event identity have explicit transition disposition.
8. Health authority changes only when the target runtime is active.
9. MCP fabric compatibility is checked or explicitly degraded before target activation.
10. Returning from Cloudflare to local is a new forward transition with a newer epoch, not rollback by deletion.
11. Failed or aborted transitions leave reviewable evidence.
12. Client surfaces attach through authority/session discovery and must not decide authority by themselves.

## State Machine

```text
not_requested
  -> proposed
  -> preparing_target
  -> source_draining
  -> source_sealed
  -> target_activating
  -> target_active
  -> source_retired
```

Failure and stop states:

```text
preparation_failed
drain_failed
seal_failed
target_activation_failed
transition_aborted
```

A transition may be aborted before `target_active` if the source authority remains canonical and can read back that no target writes were admitted. After `target_active`, reversal is represented as another transition with a newer target epoch.

## Transition Record Shape

Initial target schema:

```text
narada.nars.authority_runtime_host_transition.v1
```

Minimum record:

```json
{
  "schema": "narada.nars.authority_runtime_host_transition.v1",
  "transition_id": "arht_...",
  "session_id": "carrier_...",
  "session_lineage_id": "nars_lineage_...",
  "agent_id": "resident",
  "site_id": "narada.sonar",
  "requested_by": "operator",
  "requested_at": "2026-07-02T00:00:00.000Z",
  "state": "source_draining",
  "source_authority_runtime": {
    "authority_runtime_id": "auth_local_...",
    "host_kind": "local",
    "authority_epoch": 3,
    "event_cursor": { "last_sequence": 120 },
    "health_ref": "session.health"
  },
  "target_authority_runtime": {
    "authority_runtime_id": "auth_cf_...",
    "host_kind": "cloudflare-host",
    "authority_epoch": 4,
    "health_ref": "cloudflare_authority.session.health"
  },
  "handoff": {
    "event_log": {
      "mode": "checkpoint_plus_cursor",
      "source_last_sequence": 120,
      "target_first_sequence": 121
    },
    "operator_input_queue": {
      "mode": "drain_before_seal",
      "pending_count_at_request": 0,
      "pending_count_at_seal": 0
    },
    "artifacts": {
      "mode": "registry_plus_admitted_content",
      "source_paths_exposed": false
    },
    "mcp_fabric": {
      "mode": "compatibility_report_required",
      "status": "pending"
    }
  },
  "fencing": {
    "source_write_admission": "draining",
    "target_write_admission": "not_before_source_seal",
    "split_brain_guard": "authority_epoch_token_required"
  },
  "evidence_refs": [],
  "completed_at": null,
  "terminal_reason": null
}
```

## Handoff Dimensions

| Dimension | Required disposition |
| --- | --- |
| Event log | Cursor, checkpoint, target first sequence, and replay boundary. |
| Operator input queue | Drain, transfer, refuse-new, or target-admit-after-activation. |
| Active turn | Complete, interrupt, abandon with evidence, or refuse transition. |
| Artifacts | Registry transfer/projection, admitted content policy, and no public source paths. |
| Health | Source health until seal; target health after activation. |
| MCP fabric | Exact compatibility or explicit degraded contract. |
| Provider state | Unsupported until provider-capable authority transition is defined. |
| Secrets | Capability refs only; no secret material in transition records. |
| Surfaces | Reattach through discovery; surfaces do not carry authority. |

## Initial Allowed Host Kinds

| Host kind | Meaning |
| --- | --- |
| `local` | Local NARS authority process with Site-local session evidence. |
| `cloudflare-host` | Cloudflare-hosted NARS authority runtime slice. |

Later host kinds may include `linux-host`, `macos-host`, or `remote-private-host`, but they must satisfy the same authority-runtime contract and transition invariants.

## Operator-Facing UX Target

Operator commands may say `switch`, but output should reveal the governed transition:

```text
NARS authority host transition proposed
  session: carrier_...
  from: local epoch 3
  to: cloudflare-host epoch 4
  state: preparing_target
  next: verify target health and MCP fabric compatibility
```

Refusals should name the failed invariant:

```text
[FAIL] authority_transition_refused: active_turn_in_progress
The source authority cannot be sealed while a provider turn is active. Complete, interrupt, or explicitly abandon the turn first.
```

## Non-Goals

- Do not make projection stores canonical.
- Do not allow local and Cloudflare hosts to admit writes concurrently for the same epoch.
- Do not let `agent-web-ui`, `agent-cli`, or another surface choose authority by attachment order.
- Do not treat Cloudflare-host authority as equivalent to provider/tool-capable authority until that contract exists.
- Do not erase failed transition evidence.
- Do not use rollback language for post-activation reversal.

## Implementation Sequence

Implementation-readiness details live in [`nars-authority-runtime-host-transition-implementation-readiness.md`](nars-authority-runtime-host-transition-implementation-readiness.md). Concept fixtures live under [`fixtures/nars-authority-runtime-host-transition/`](fixtures/nars-authority-runtime-host-transition/).

1. Document this concept and link it from projection/runtime docs.
2. Add schema fixtures for transition records and refusal records.
3. Add authority epoch and host-kind fields to session index/discovery records where needed.
4. Add read-only transition planning command that reports feasibility.
5. Implement local-to-Cloudflare synthetic transition only, with no provider/tool migration.
6. Add browser/local surface reattach tests through authority discovery.
7. Add Cloudflare-to-local transition as a second governed transition.
8. Define provider/tool-capable authority transition separately.
