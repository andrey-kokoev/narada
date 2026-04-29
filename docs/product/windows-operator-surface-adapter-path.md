# Windows Operator Surface Adapter Path

This document plans the first concrete spatial adapter path for [`Operator Surface`](../concepts/operator-surface.md) on Windows.

It does not materialize profiles, edit Komorebi or YASB configuration, launch terminals, or mutate the Windows User Site. It records the adapter posture that a future materializer must obey.

## Adapter Chain

The earned Windows chain is:

```text
Site operator_surfaces declaration
-> Windows Terminal profile
-> stable tab/window title
-> Komorebi rule or focus target
-> YASB/AHK launch or focus affordance
-> visible inhabited work surface
```

The primitive is still `OperatorSurface`. Windows Terminal, Komorebi, YASB, and AHK are adapters.

## Example Declaration

```json
{
  "surface_id": "narada-proper-builder",
  "purpose": "Builder work surface for Narada proper",
  "site_id": "narada-proper",
  "role_id": "builder",
  "workflow_binding": "narada_self_build",
  "locus_binding": "narada-proper",
  "embodiment_id": "windows-user-shell",
  "adapter": {
    "kind": "windows_terminal",
    "materialization": "dry_run_first"
  },
  "launch": {
    "profile": "Narada Proper Builder",
    "command": "wt -p \"Narada Proper Builder\"",
    "starting_directory": "\\\\wsl.localhost\\Ubuntu\\home\\andrey\\src\\narada"
  },
  "focus_identity": {
    "kind": "window_title",
    "value": "narada-proper-builder",
    "requires_suppress_application_title": true
  },
  "placement_hints": {
    "desktop": "Narada",
    "komorebi_workspace": "I"
  },
  "recovery_posture": "focus_if_present",
  "authority_limits": [
    "surface_is_not_authority_locus",
    "surface_does_not_grant_effect_capability",
    "surface_does_not_grant_operator_authority"
  ]
}
```

Windows Terminal materialization would translate that into profile fields such as:

```json
{
  "name": "Narada Proper Builder",
  "tabTitle": "narada-proper-builder",
  "suppressApplicationTitle": true,
  "startingDirectory": "\\\\wsl.localhost\\Ubuntu\\home\\andrey\\src\\narada"
}
```

The stable title is the bridge from Terminal to Komorebi/YASB. Without `suppressApplicationTitle`, shell prompts, CLI programs, or agent tools can mutate the visible title and break focus/rule matching.

## CLI And API Runtime Binding

CLI agent runtimes bind naturally to terminal Operator Surfaces:

```text
OperatorSurface: narada-proper-builder terminal
ControlChannel: terminal stdin/stdout
AgentRuntime: codex_cli or kimi_cli
SessionBinding: task/chapter/evidence refs plus transcript refs
```

API or MCP agent runtimes may not have a spatial surface:

```text
OperatorSurface: optional console/projection
ControlChannel: API thread, MCP stdio, inbox envelope, task evidence, or transcript
AgentRuntime: api_agent or mcp_client
SessionBinding: task/chapter/evidence refs plus conversation/channel refs
```

This distinction prevents terminal bias. API conversations can be governed without pretending they have native window identity.

## Authority Locus

Windows adapter materialization authority is not Narada proper by default.

Likely authority loci:

| Adapter effect | Likely authority locus |
| --- | --- |
| Windows Terminal profile settings | Windows User Site |
| YASB launch/focus button | Windows User Site |
| AHK launch/focus script | Windows User Site or PC Site, depending on ownership of the script and machine policy |
| Komorebi rule for machine/window behavior | PC Site when machine/session recovery authority owns it; otherwise Windows User Site if user-local |
| Narada proper doctrine/config examples | Narada proper |

The current WSL Narada proper clone may document and propose this adapter path. It must not assume authority to mutate Windows Terminal, Komorebi, YASB, or AHK configuration.

## Visibility-Domain Reconciliation

Windows virtual desktop membership is an external visibility-domain truth. Komorebi state is adapter state. A Windows operator-surface adapter must not treat Komorebi's managed HWND set as authoritative until it has reconciled each HWND against Windows desktop membership.

This should be represented as a Site state projection plus transition protocol, not as a private script assumption. See [`site-state-projections.md`](site-state-projections.md).

The earned reconciliation path from the `desktop-sunroom-2` diagnostic is:

```text
after Windows virtual desktop transition
-> read current desktop identity
-> inspect Komorebi-managed HWNDs for the active display/workspace
-> query each HWND's Windows virtual desktop membership
-> remove, float, or unmanage HWNDs outside the current desktop
-> retile current-desktop windows
-> assert no off-desktop HWNDs and no invalid rectangles remain
```

Evidence reference:

```text
C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\logs\komorebi\desktop-switch-state-leak-20260429-132859.json
```

Narada proper records the doctrine and bounded handoff. The Windows PC Site or User Site owns any Komorebi/YASB/Windows mutation.

## Materializer Evidence Requirements

A future materializer must produce durable evidence before it can claim success:

| Evidence | Purpose |
| --- | --- |
| Surface declaration read-back | Proves the requested `operator_surfaces` entry was read from the intended Site. |
| Authority-locus preflight | Proves the materializer is running at, or routed through, the Windows User/PC authority locus. |
| Dry-run plan | Shows profile/rule/button/script changes before execution. |
| Profile diff or exported profile artifact | Shows the exact Windows Terminal mutation. |
| Command transcript or CEIZ run record | Shows the bounded command execution path. |
| Adapter read-back | Confirms profile/rule/button exists after execution. |
| Session-binding read-back | Confirms any continuity record points to the correct surface/runtime/channel. |
| Residuals | Records unfixed title drift, path translation, missing adapters, or manual steps. |

## Risks

| Risk | Control |
| --- | --- |
| Stale Windows Terminal profile file | Read-back actual settings after write; do not trust generated diff alone. |
| Windows/WSL path translation drift | Store both Windows path and WSL path when crossing loci; test launch path explicitly. |
| Host identity ambiguity | Record hostname, `COMPUTERNAME`, and declared Site authority locus separately. |
| Komorebi title matching drift | Require stable `tabTitle` plus `suppressApplicationTitle`; read back visible title when possible. |
| Komorebi cross-desktop HWND leak | Reconcile Komorebi-managed HWNDs against Windows virtual desktop membership before retile/focus recovery. |
| YASB/AHK launch side effects | Treat as external adapter mutation; dry-run and evidence required. |
| API transcript locality | Keep API thread/channel refs in `SessionBinding`; do not require native window identity. |
| Accidental external mutation | Route adapter writes through CEIZ or equivalent governed execution boundary with explicit `--execute`. |
| Secret leakage | Surface declarations may reference profiles and commands, never raw tokens or credentials. |

## Follow-Up Posture

Implementation belongs in the authority locus that owns the adapter:

- Windows User Site for user profile launch/focus affordances.
- PC Site for machine/session recovery and Komorebi behavior when machine-local.
- Narada proper only for shared doctrine, schemas, read-only inspection commands, and generic materialization law.

No Narada proper implementation task is created by this plan unless the requested work is generic inspection/materialization grammar rather than Windows-local adapter mutation.
