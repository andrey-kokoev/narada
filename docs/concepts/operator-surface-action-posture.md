# Operator Surface Action Posture

Operator Surface Action Posture classifies controls by the kind of work they present, not by the helper function, script, or command that implements them.

It exists because a valid tool can still be wrong in the primary operator work surface. A diagnostic, repair, or intrusive platform mutation may be implemented and tested, but it should not appear beside primary work actions merely because it is available.

## Action Classes

| Class | Meaning | Primary Work Surface Posture |
| --- | --- | --- |
| `primary_work_action` | The normal next action that advances the Site's declared work outcome. | Eligible for primary rows when prerequisites and authority are satisfied. |
| `secondary_utility` | Helpful support action that does not itself advance the primary work outcome. | Available from secondary menus or detail views. |
| `diagnostic_tool` | Observes, probes, or perturbs enough to diagnose state without claiming the work outcome. | Not shown in primary rows by default. |
| `repair_recovery_action` | Restores, resets, retries, reconciles, or recovers a broken posture. | Hidden behind recovery affordances, warnings, and evidence capture. |
| `dangerous_intrusive_platform_mutation` | Changes platform, display, process, registry, service, credential, or external state in a way that can disrupt current work. | Never primary by default; requires explicit warning and bounded confirmation/admission. |
| `hidden_internal_primitive` | Low-level implementation step not meaningful as an Operator decision. | Not exposed directly; projected only through a higher-level capability if needed. |
| `contextual_capability_projection` | A context-specific label or mode of a canonical capability family. | Eligible when the projected invariant is the Operator's current work decision. |

The class is part of the operator-surface contract. It should be testable or inspectable, not inferred from button placement.

## Projection Rules

1. Primary rows show `primary_work_action` and valid `contextual_capability_projection` controls only.
2. `diagnostic_tool` controls remain discoverable, but not in the main work-action row by default.
3. `repair_recovery_action` controls require an abnormal condition, recovery context, or explicit recovery menu.
4. `dangerous_intrusive_platform_mutation` controls require warning, confirmation/admission posture, and restoration guidance before exposure.
5. `hidden_internal_primitive` controls must not be exposed as standalone Operator actions.
6. A contextual projection may use a strong label only when its operator-visible invariant is proven for the normal path.
7. Surface tests must assert both mechanics and placement posture: available where appropriate, absent where inappropriate.

These rules apply to CLI dashboards, GUI bars, web consoles, MCP tool menus, terminal launchers, Windows surface adapters, and generated operator summaries.

## Warning And Restoration Expectations

| Class | Required Expectations |
| --- | --- |
| `diagnostic_tool` | State what is observed, whether the probe is passive or active, where result evidence is stored, and what not to conclude from it. |
| `repair_recovery_action` | State precondition, affected authority zone, rollback/restoration route when available, evidence artifact, and residual if repair only partially restores posture. |
| `dangerous_intrusive_platform_mutation` | State disruption risk, exact platform area affected, confirmation/admission requirement, restoration command or manual reversal, and audit/evidence location. |

If restoration is not known, the control must say so and should be harder to reach.

## Delivery Admission Gate

Operator Surface message delivery is an input/focus mutation candidate, not a harmless notification. Before any execution path records or performs delivery into a focused surface, it must admit the delivery against current Operator activity and workspace posture.

Required delivery states:

| State | Meaning |
| --- | --- |
| `requested` | A send attempt entered delivery admission; this is never terminal by itself. |
| `queued_waiting_for_idle` | Delivery is held because recent keyboard, pointer, or unknown activity makes interruption unsafe. |
| `delivered` | Delivery is admitted because the Operator is idle, or because explicit urgent-interrupt authority was supplied. |
| `expired` | The queued delivery timed out before idle admission. |
| `refused` | Delivery is disallowed by policy, missing authority, or cross-desktop posture. |
| `fallback_to_inbox` | Delivery is converted to inert inbox work instead of mutating the active surface. |
| `explicit_interrupt` | An admitted interruption authority was consumed before delivery. |

Every executable send attempt must emit durable evidence of the state path, even when no focus/input mutation occurs. Examples: `requested -> queued_waiting_for_idle`, `requested -> refused`, `requested -> expired`, `requested -> fallback_to_inbox`, and `requested -> explicit_interrupt -> delivered`.

Default posture:

- `idle` activity may admit delivery.
- `active_typing`, `active_pointer`, and `unknown` activity must not mutate focus/input by default.
- Active delivery defaults to `queued_waiting_for_idle`, not forced focus.
- Urgent interruption requires an explicit authority reference and must be visible in send evidence.
- Cross-desktop summon or workspace switching is a separate visible mutation. It is refused unless policy and authority admit it, and evidence records the current desktop, target desktop, policy, and authority reference.
- Hidden cross-desktop input remains refused by default. The safe admitted alternative is `operator_confirmed_switch_send_restore`: first return `operator_confirmation_required` with the exact next command, then require an explicit Operator confirmation reference before the runtime may visibly switch to the target desktop, send, restore the prior desktop, and record restoration evidence.

## Motivating Example: Display Tools

`Exchange Monitor Contents` is a contextual projection of the canonical `monitor_content_transfer` capability. With exactly two monitors, the Operator-visible invariant is that the visible contents are exchanged between monitors.

`Toggle Primary Display` is not the same kind of action. It is a diagnostic or intrusive platform mutation: it changes display platform state and may help diagnose or repair monitor posture, but it does not by itself accomplish the Operator's work outcome of exchanging monitor contents.

Correct projection:

| Control | Class | Primary Row? | Required Test |
| --- | --- | --- | --- |
| `Exchange Monitor Contents` | `contextual_capability_projection` | Yes, when exactly two monitors and invariant proof exists. | Normal operator path exchanges visible contents or names weaker residual. |
| `Toggle Primary Display` | `diagnostic_tool` or `dangerous_intrusive_platform_mutation` | No, by default. | Tool remains reachable from diagnostics/recovery and is absent from the main operator bar. |

This prevents a mechanically valid display helper from displacing or confusing the real work action.

## Test Requirements

Operator-surface tests must include projection posture assertions:

- The primary work-action row includes eligible primary/contextual actions.
- Diagnostic and intrusive tools are absent from the primary row by default.
- Diagnostic and intrusive tools remain available in the declared diagnostic/recovery location when appropriate.
- Warning, logging, and restoration text exists for repair or intrusive actions.
- Tests name residuals when mechanics are proven but operator-visible outcome is not.

Weak test:

```text
click Toggle Primary Display -> command exits zero
```

Required posture test:

```text
main operator bar does not show Toggle Primary Display
diagnostics menu shows Toggle Primary Display with warning/restoration copy
main operator bar shows Exchange Monitor Contents only when monitor content exchange invariant is proven
```

## Coverage Audit Signals

Coverage Audit should flag:

- diagnostic controls in primary work rows;
- intrusive platform controls without warning/restoration posture;
- hidden primitives exposed as Operator actions;
- tests that prove command execution but not action class placement;
- contextual projections whose label promises more than normal-path evidence proves;
- repair actions that mutate state without evidence artifacts.

The audit finding should record the action class, current placement, expected placement, operator-visible invariant, and missing warning/restoration/evidence posture.

## Relationship To Contextual Capability Projection

Contextual Capability Projection answers: "Which label or mode should represent this canonical capability here?"

Operator Surface Action Posture answers: "Should this action appear in this surface tier at all?"

Both are required. A control can be a valid implemented tool and still be barred from the primary work-action row.

## Product Rule

```text
Primary operator surfaces are for work decisions.
Diagnostics, repairs, intrusive mutations, and hidden primitives remain governed and available through their proper posture, not promoted by implementation convenience.
```
