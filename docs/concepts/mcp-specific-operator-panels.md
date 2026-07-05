# MCP-Specific Operator Panels

## Purpose

MCP-specific operator panels are read-oriented projections of authority MCP surfaces into operator UIs such as `agent-web-ui`. They make a surface understandable without turning the browser into the authority or making raw MCP tools the UI contract.

SOP is the reference implementation. It proves the pattern for future panels such as mail, task lifecycle, scheduler, or artifacts.

## Target Shape

The pattern has four layers:

```text
MCP authority surface
  -> NARS read-side summary request
  -> typed projection DTO/event
  -> client panel renderer
```

The browser asks NARS for a summary, not for direct MCP calls. NARS uses the mounted Site MCP fabric, normalizes the result into a stable DTO, emits a session event, and the client renders that event.

## Required Pieces

| Piece | Owner | Example |
| --- | --- | --- |
| Surface detection | NARS / carrier runtime | Detect SOP by `sop_template_list` or `sop_run_list`. |
| Affordance declaration | NARS projection over MCP metadata | `session.surface.affordances` with panel sections and available action names. |
| Summary method | NARS protocol | `session.sop.summary`. |
| Summary event | NARS event stream | `session_sop_summary`. |
| Client consumption | Agent web UI | `useSopSummary` reads the latest summary event. |
| Panel rendering | Agent web UI | `SopPanel.vue`. |
| Contract docs/tests | Shared packages | Runtime DTO tests and web UI rendering tests. |

## DTO Rules

MCP-specific summary DTOs must be display-safe and stable enough for clients to render without knowing raw MCP internals.

Rules:

- Include `schema`, `event`, `request_id`, `status`, `server_name`, and `errors`.
- Include an `affordance_contract` that declares sections and possible actions.
- Use normalized collections shaped as `{ items, count }`.
- Preserve useful domain identifiers such as `sop_id`, `run_id`, task number, message id, or artifact id.
- Normalize nested timeline/detail rows into predictable arrays.
- Distinguish displayable `available_actions` from admitted mutations. Available actions are not authority grants.
- Report partial reads as `status: partial` with bounded `errors`, not as an empty healthy panel.

## Action Semantics

Read actions may be represented by immediate UI controls when they only request another NARS summary or reveal already projected details.

Mutating actions must not call MCP directly from the browser. They require a NARS protocol method and authority-surface admission. The UI can display the action only as a candidate until that admission path exists.

For SOP:

| Action | Current posture |
| --- | --- |
| `refresh` / `refresh_run` | Read projection request through `session.sop.summary`. |
| `open_template` / `open_run` | Local panel expansion or future read-only detail request. |
| `confirm_operator_step` | Candidate mutation; requires NARS admission before execution. |
| `advance_run` | Candidate mutation; requires NARS admission before execution. |
| `cancel_run` | Candidate mutation; requires NARS admission and warning posture. |

## Reference Acceptance Criteria

A MCP-specific panel is load-bearing only when all of these are true:

1. The panel appears because NARS detected or declared the surface, not because the client guessed from text.
2. The client can request a fresh summary through an admitted NARS method.
3. The runtime has tests for the emitted DTO shape, including nested detail rows.
4. The client has tests for the panel trigger, refresh path, and read-only rendering contract.
5. Missing tools, partial reads, and unavailable surfaces produce visible bounded states.
6. Mutating actions are labeled as available/candidate until NARS admission is implemented.

## Extension Guidance

When adding another MCP panel, start from a read-only summary. Do not begin with action buttons. First prove:

- the surface is discoverable;
- NARS owns the summary method;
- the DTO is normalized and documented;
- the UI can render the normal, empty, unavailable, and partial states;
- tests cover both runtime source and client projection.

Only then add mutation-specific protocol methods.
