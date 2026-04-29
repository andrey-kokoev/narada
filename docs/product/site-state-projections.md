# Site State Projections And Transition Protocols

A **Site State Projection** is a queryable current-state surface derived from authority records, runtime observations, and evidence logs. It is not the authority record itself.

A **Transition Protocol** is the governed grammar for changing or refreshing a projection after an event, diagnostic, runtime transition, or external authority change.

This document exists because Sites need a shared way to declare volatile runtime truth without letting scripts, private logs, or adapter caches become authority by convenience.

## State Layers

| Layer | Meaning | Authority posture |
| --- | --- | --- |
| Authority record | Durable Site config, governance coordinates, capability grants, task lifecycle, admitted inbox state, lineage. | Governing truth for mutation/admission. |
| Runtime observation | Doctor result, daemon status, display topology, current desktop, process/session state, adapter query. | Evidence input; may be stale or local. |
| State projection | Queryable current-state summary derived from authority records plus bounded observations. | Read model; freshness and source evidence must be visible. |
| Transition event | Event that can invalidate or refresh a projection. | Trigger only; not mutation authority by itself. |
| Evidence log | Bounded trace of observation, transition, reconciliation, and residuals. | Supports admission/reconciliation; raw logs remain local unless exported intentionally. |

The projection exists to answer what this Site currently believes is true enough to operate against without hiding which authority or observation produced that belief.

## Projection Declaration

A Site may declare projections in governance coordinates or a Site-local policy file:

```json
{
  "state_projections": [
    {
      "projection_id": "windows_operator_surface_current_state",
      "purpose": "Current operator-surface posture for Windows desktop, Komorebi, and YASB adapters.",
      "authority_records": [
        "governance.operator_surfaces",
        "governance.authority_locus"
      ],
      "runtime_observations": [
        "windows.current_virtual_desktop",
        "komorebi.managed_hwnds",
        "yasb.runtime_status"
      ],
      "freshness": {
        "max_age": "one_transition",
        "invalidated_by": ["windows_desktop_changed", "display_topology_changed", "komorebi_restarted"]
      },
      "evidence_locus": "logs/operator-surface/",
      "authority_limits": [
        "projection_is_not_authority_record",
        "scripts_update_projection_only_through_transition_protocol",
        "raw_logs_do_not_admit_mutation"
      ]
    }
  ]
}
```

Projection declarations should name authority records, runtime observations, freshness rules, evidence location, allowed transition protocols, and escalation when projection and authority record disagree.

## Transition Protocol Grammar

```json
{
  "transition_id": "windows_desktop_transition_reconcile",
  "trigger": "windows_desktop_changed",
  "source_authority": "windows_shell_virtual_desktop_membership",
  "target_projection": "windows_operator_surface_current_state",
  "admissibility_checks": [
    "current_desktop_identity_read",
    "komorebi_state_read",
    "hwnd_desktop_membership_read"
  ],
  "evidence_produced": [
    "bounded_transition_summary",
    "stale_hwnd_count",
    "invalid_rectangle_count",
    "residuals"
  ],
  "reconciliation_responsibility": "pc_site_or_user_site",
  "repair_posture": "repair_recovery_action",
  "escalation": [
    {
      "condition": "off_desktop_hwnds_remain",
      "action": "submit_inbox_observation_or_open_pc_site_task"
    },
    {
      "condition": "authority_locus_ambiguous",
      "action": "stop_before_mutation_and_request_operator_locus_decision"
    }
  ]
}
```

Required fields:

| Field | Meaning |
| --- | --- |
| `transition_id` | Stable protocol id. |
| `trigger` | Event or condition that starts the protocol. |
| `source_authority` | External or Site authority that owns the truth being observed. |
| `target_projection` | Projection refreshed or invalidated. |
| `admissibility_checks` | Reads/checks required before acting on the projection. |
| `evidence_produced` | Bounded evidence artifacts or summaries. |
| `reconciliation_responsibility` | Site/locus/role responsible for refresh or repair. |
| `repair_posture` | `read_only`, `diagnostic_tool`, `repair_recovery_action`, or `dangerous_intrusive_platform_mutation`. |
| `escalation` | Conditions that require a task, inbox envelope, operator decision, or external handoff. |

## Script Rule

Scripts may observe, summarize, and write projection records only through a declared transition protocol. A script-specific log is not enough.

Correct posture:

```text
script observes host/runtime state
-> transition protocol validates source authority and admissibility
-> projection is refreshed or marked stale
-> bounded evidence is written
-> residuals/escalations are submitted through inbox/task when needed
```

Incorrect posture:

```text
script writes private log
-> later code assumes log means current state
-> adapter mutates host based on stale/private assumption
```

## Windows Operator Surface Fixture

The first earned fixture is the Windows virtual desktop + Komorebi + YASB surface.

Authority split:

| State | Authority |
| --- | --- |
| User preference and surface declaration | User Site or Site governance coordinates. |
| Machine/session behavior and Komorebi recovery | PC Site when machine-local recovery owns it. |
| Windows virtual desktop membership | Windows shell / OS APIs. |
| Komorebi tiling state | Komorebi adapter state, reconciled against Windows membership. |
| YASB runtime/button state | User or PC Site adapter config, depending on ownership. |

Transition protocols:

| Trigger | Projection effect | Responsibility |
| --- | --- | --- |
| `windows_desktop_changed` | Invalidate and refresh active desktop, Komorebi HWND membership, invalid rectangles. | PC Site or User Site. |
| `display_topology_changed` | Refresh monitor/display membership and surface placement. | PC Site. |
| `komorebi_restarted` | Rebuild managed HWND projection from host truth. | PC Site. |
| `yasb_reloaded` | Refresh launcher/status projection; do not infer Komorebi health. | User Site or PC Site. |

The diagnostic behind task 1085 remains the bounded evidence reference:

```text
C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\logs\komorebi\desktop-switch-state-leak-20260429-132859.json
```

Narada proper may define this model and shared grammar. It must not mutate Windows, Komorebi, YASB, or local PC Site runtime while doing so.

## Escalation Rules

- If a projection is stale but no mutation is required, report a stabilization observation.
- If reconciliation can be done locally by the owning Site, create or run a Site-local task/command under that Site's authority.
- If authority locus is ambiguous, stop before mutation and request an Operator locus decision.
- If the same projection repeatedly goes stale, promote the pattern to a transition protocol or daemon-source task.
- If raw logs are needed for debugging, keep them in the local Site evidence locus and export only bounded summaries upstream.

## Relationship To Adjacent Doctrine

- [`site-governance-coordinates.md`](site-governance-coordinates.md): declares where projection, evidence, and authority live.
- [`site-stabilization-reconciliation.md`](site-stabilization-reconciliation.md): compares durable memory, runtime truth, and projections without mutating.
- [`visibility-domain-reconciliation.md`](../concepts/visibility-domain-reconciliation.md): defines host membership truth as an adapter reconciliation boundary.
- [`canonical-mutation-evidence.md`](../concepts/canonical-mutation-evidence.md): governs portable mutation evidence when a projection refresh is admitted as a mutation.
- [`windows-operator-surface-adapter-path.md`](windows-operator-surface-adapter-path.md): concrete Windows fixture.
