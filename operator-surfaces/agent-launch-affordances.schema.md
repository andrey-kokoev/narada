# Agent Launch Affordances Schema

`operator-surfaces/agent-launch-affordances.json` is the portable authority record for Narada proper crew launch affordance intent.

It is not a shortcut folder, runtime binding store, process launcher, or PC-locus authority. Projection files under `.crew/agent-shortcuts` or Desktop are local materializations of this intent and are not authority.

## Record Shape

```json
{
  "schema": "narada.operator_surface.agent_launch_affordances.v0",
  "site_id": "narada",
  "affordances": [
    {
      "affordance_id": "narada.architect.codex",
      "label": "Narada Agent - architect (codex)",
      "identity_name": "narada.architect",
      "runtime": "codex",
      "enabled": true,
      "role": "architect",
      "materializations": [
        {
          "kind": "desktop_shortcut",
          "default_projection_dir": ".crew/agent-shortcuts"
        }
      ],
      "required_binding_proof": {
        "before_window_snapshot": true,
        "unique_new_carrier_window": true,
        "inhabited_child_claim": true,
        "exactly_one_new_visible_cascadia_hwnd": true,
        "sqlite_binding_to_admitted_identity": true,
        "osl_projection_refresh": true,
        "fail_closed_on_ambiguous_or_missing_window_delta": true
      }
    }
  ]
}
```

## Binding Requirement

Launch carriers must prove the visible Windows Terminal carrier before mutating runtime binding authority:

- capture a before-window snapshot;
- prove a unique new carrier window/id;
- prove an inhabited child claim;
- prove exactly one new visible `CASCADIA_HOSTING_WINDOW_CLASS` HWND;
- write SQLite binding only to an admitted identity;
- refresh OSL projection after binding;
- fail closed on missing/mismatched claim or ambiguous/missing window delta.

Identity must not be inferred from terminal title, process order, or foreground focus.

## Carrier Selection

`carrier_kind` is the launch-selection kind from the canonical
`carrier-launch-matrix.json` contract. It may be omitted only when the
selected `runtime_substrate_kind` maps to exactly one launch-selection row.
When a runtime is shared by multiple rows, such as
`narada-agent-runtime-server` for `agent-cli` and `agent-web-ui`, the
affordance must declare `carrier_kind`; the PC projection must refuse an
ambiguous record rather than silently selecting a default carrier.

## Not Admitted

- Direct substrate shortcut execution.
- Native shell fallback.
- PC-locus mutation.
- Operator-surface runtime copying.
- Source Site runtime state import.
- Secrets or credentials.
- Binding mutation from shortcut filename or window title.
- Actual live launch/bind execution from this descriptor file.
