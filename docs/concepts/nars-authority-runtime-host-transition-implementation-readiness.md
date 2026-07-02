# NARS Authority Runtime Host Transition Implementation Readiness

## Purpose

This document converts [`nars-authority-runtime-host-transition.md`](nars-authority-runtime-host-transition.md) into an implementation-ready plan. It intentionally stops before code execution. Its output is the input to the next implementation chapter.

## Scope Boundary

The first slice is synthetic/no-provider/no-tools authority rehome. It may prove that authority moves between local and Cloudflare-host NARS runtimes, but it must not claim provider state, model turn state, or real MCP tool execution migration.

## Session Index Fields

Session discovery remains a projection. Add these fields to per-session records and aggregate summaries only as discovery metadata:

| Field | Required | Meaning | Compatibility |
| --- | --- | --- | --- |
| `authority_runtime_host` | Optional during migration, required for new records | Current known host kind: `local` or `cloudflare-host`. | Missing means `unknown_legacy`; callers must verify live authority. |
| `authority_epoch` | Optional during migration, required for new records | Monotonic authority generation. | Missing means epoch cannot be compared; planner must refuse execution and offer repair/rebuild. |
| `authority_runtime_id` | Optional | Runtime authority identifier, not endpoint identity. | Missing allowed for old local sessions. |
| `authority_transition_state` | Optional | Current transition state when a transition is active. | Missing means no transition known, not proof that none exists. |
| `superseded_by_session_id` | Optional | Replacement session id when the record is stale after rehome. | Missing means unknown. |
| `authority_locator_ref` | Optional | Pointer to current authority locator/endpoint bundle. | Old records keep direct endpoints. |

Display rule: surfaces may show host/epoch from the index, but must verify `/health` or `session.health` before presenting a session as attachable. The index never decides authority.

## Read-Only Planner Command

Target operator command shape:

```bash
narada nars authority-transition plan \
  --site-root <site-root> \
  --session <session-id> \
  --target-host cloudflare-host \
  --format human|json
```

Cloudflare-to-local uses the same command with `--target-host local`. A later executor command should use a distinct verb, for example `narada nars authority-transition execute`, so planning cannot accidentally mutate.

Human output must include:

```text
NARS authority host transition plan
  session: carrier_...
  from: local epoch 3
  to: cloudflare-host epoch 4
  state: feasible | refused | warning
  checks:
    active turn: clear
    queue: 0 pending
    events: source cursor 120, target first 121
    artifacts: registry_plus_admitted_content
    health: target reachable
    mcp fabric: compatible
  next: execute transition | repair ...
```

JSON output should use `narada.nars.authority_runtime_host_transition_plan.v1` and include `transition_record_candidate`, `checks[]`, `warnings[]`, `refusals[]`, and `recommended_next_action`.

## Feasibility Checks And Refusals

| Check | Hard refusal code | Warning/degraded option | Evidence |
| --- | --- | --- | --- |
| Active turn | `active_turn_in_progress` | none for first slice | `session.status` active turn evidence |
| Pending queue | `queue_not_drainable` | `transfer_after_seal` only if implemented | queue state snapshot |
| Event cursor | `event_cursor_unavailable` | none | events read cursor and durable log readback |
| Target health | `target_health_unavailable` | none | target health response |
| Source seal | `source_seal_unavailable` | none | source admission gate readback |
| MCP fabric | `mcp_fabric_incompatible` | `explicit_degraded_acceptance` when allowed | fabric compatibility report |
| Artifacts | `artifact_handoff_policy_refused` | registry-only if no content required | artifact registry scan/report |
| Credentials | `transition_credentials_unavailable` | none | secret/capability ref status, never secret content |
| Stale discovery | `session_discovery_stale` | rebuild index before planning | health failure and heartbeat age |
| Projection as authority | `projection_cache_is_not_authority` | none | target descriptor role mismatch |

## Drain, Seal, And Activation Semantics

### `source_draining`

Allowed:

- Existing active turn must already be absent for first slice.
- Already-acknowledged queue items may drain if the selected queue mode is `drain_before_seal`.
- Read-only event/artifact/health reads continue.

Refused:

- New `conversation.send`, `conversation.enqueue`, or `conversation.steer` at source unless admitted as a transition-specific target-route candidate.
- Target canonical writes.

### `source_sealed`

Required evidence:

- Source write admission gate returns sealed for the transition id and source epoch.
- Source event cursor is stable at the handoff boundary.
- Queue pending count is compatible with selected handoff mode.

Allowed:

- Read-only replay and health that report sealed/superseded posture.

Refused:

- Any canonical source write for the sealed epoch.

### `target_activating`

Required before target write admission:

- Source seal evidence.
- Target health evidence.
- Target authority epoch token.
- Event first-sequence boundary.
- MCP fabric report.
- Artifact handoff policy result.

### `target_active`

The target becomes the only canonical write authority. Source endpoints return sealed/superseded posture and the target locator.

Abort is valid only before `target_active`. After target activation, moving back to local is a new transition with a newer epoch.

## Handoff Dimensions

| Dimension | Mode vocabulary | Evidence requirement |
| --- | --- | --- |
| Event log | `checkpoint_plus_cursor` | source last sequence, target first sequence, replay check |
| Operator input queue | `drain_before_seal`, `transfer_after_seal`, `refuse_new_until_target_active` | queue state before/after drain or transfer |
| Active turn | `refuse_if_active` for first slice | `session.status` with no active turn |
| Artifacts | `registry_plus_admitted_content`, `registry_only_lazy_content`, `none` | artifact registry report; no public source path leakage |
| Health | `source_until_seal_target_after_activation` | health readback from source and target |
| MCP fabric | `compatibility_report_required`, `explicit_degraded_acceptance` | fabric summary and incompatibility list |
| Provider state | `unsupported_for_synthetic_slice`, `not_present` | explicit refusal or absence evidence |
| Secrets | `capability_refs_only` | capability/secret ref availability, no secret value |
| Surfaces | `reattach_through_authority_locator` | stale endpoint and target locator messages |

## Local-To-Cloudflare Synthetic E2E Plan

Phases:

1. Start local NARS synthetic/controlled session with no active turn.
2. Record source health, event cursor, queue state, and artifact registry snapshot.
3. Create Cloudflare-host target authority runtime in prepared state with target epoch = source epoch + 1.
4. Run planner and assert `feasible`.
5. Enter `source_draining`; refuse or route new source input according to policy.
6. Seal source; prove source cannot admit canonical writes.
7. Activate target; target emits first canonical event at declared boundary.
8. Attach local and web surfaces through authority locator; verify they follow target.
9. Submit operator input through target; verify replay and live delivery.
10. Verify source reports sealed/superseded and points at target locator.
11. Clean up/revoke target and keep transition evidence.

No split-brain proof requires at least one attempted source write after seal to be refused and one target write after activation to be accepted with the target epoch.

## Cloudflare-To-Local Plan

The reflected direction is not rollback. It is another `authority_runtime_host_transition` with a newer epoch:

```text
cloudflare-host epoch 4 -> local epoch 5
```

Differences from local-to-Cloudflare:

- Target preparation creates or resumes a local NARS authority process instead of a Cloudflare authority object.
- Local storage paths must be resolved through `@narada2/site-paths`.
- Artifact handoff may be a local materialization from Cloudflare authority artifacts, never direct Cloudflare cache promotion.
- Local MCP fabric compatibility must be checked against the target Site fabric.
- Source Cloudflare endpoints must report sealed/superseded after target activation.

Shared implementation should include transition records, planner checks, refusal shapes, epoch fencing, and surface reattach semantics.

## Surface Reattach Behavior

Surfaces are projections. They must not carry or choose authority.

Before transition:

- Show current host/epoch when known.
- Offer attach through current authority locator.

During transition:

- Show transition state, source host, target host, and the current blocking check.
- Disable ordinary input when source is draining unless NARS advertises a target route.
- Show queued/dropped/routed disposition from NARS events, not local guesses.

After transition:

- Source endpoint responses should display `sealed` or `superseded` with the target locator.
- Clients should reattach to the target locator with replay from the target authority.
- Web UI and CLI should show a concise line: `authority moved: local epoch 3 -> cloudflare-host epoch 4`.

Stale endpoint UX must not look like a generic network failure when the source can report supersession.

## Implementation Chapter

The follow-on implementation chapter is `nars-authority-runtime-host-transition-implementation`.

| Task | Scope |
| --- | --- |
| 1614 | Package-owned schema validation for transition/refusal records. |
| 1615 | Session index host/epoch fields and compatibility migration. |
| 1616 | Read-only planner command and JSON/human output. |
| 1617 | Feasibility matrix implementation and tests. |
| 1618 | Source drain/seal admission gates. |
| 1619 | Target activation handshake and epoch fencing. |
| 1620 | Local-to-Cloudflare synthetic transition E2E. |
| 1621 | Surface reattach and stale endpoint UX. |
| 1622 | Cloudflare-to-local planning/fixture slice. |

Provider/tool-capable authority transfer remains a future chapter.

## Follow-Up Ledger

- Deferred: provider/tool-capable authority transfer.
- Deferred: exact production credentials and secret-capability transition contract beyond capability refs.
- Deferred: multi-session or whole-Site authority migration.

