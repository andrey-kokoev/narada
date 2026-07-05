# MCP-Specific Operator Panels

## Purpose

MCP-specific operator panels are read-oriented projections of authority MCP surfaces into operator UIs such as `agent-web-ui`. They make a surface understandable without turning the browser into the authority or making raw MCP tools the UI contract.

SOP is the reference workflow implementation. Synced Email is the reference read-only synced-record implementation over `mailbox-mcp`. Together they prove the pattern for future panels such as task lifecycle, scheduler, artifacts, or richer mail views.

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
| Surface detection | NARS / carrier runtime | Detect SOP by `sop_template_list` or `sop_run_list`; detect synced email by `mailbox_accounts_list` or `mailbox_messages_list`. |
| Affordance declaration | NARS projection over MCP metadata | `session.surface.affordances` with panel sections and available action names. |
| Summary method | NARS protocol | `session.sop.summary`, `session.mailbox.summary`. |
| Summary event | NARS event stream | `session_sop_summary`, `session_mailbox_summary`. |
| Client consumption | Agent web UI | `useSopSummary` reads the latest summary event. |
| Panel rendering | Agent web UI | `SopPanel.vue`, `MailboxPanel.vue`. |
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

For Synced Email:

| Action | Current posture |
| --- | --- |
| `refresh` | Read projection request through `session.mailbox.summary`. |
| `open_message` / `open_thread` | Local panel expansion or future read-only detail request. |
| mail send, draft, delete, move | Out of scope for `mailbox-mcp`; these belong to explicit Graph/mail authority paths, not the read-only synced mailbox panel. |

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

## Naming Conventions

Use the same names across protocol, event stream, runtime helpers, composables, and components. This keeps new panels searchable and avoids client-specific vocabulary.

| Concept | Convention | Example |
| --- | --- | --- |
| Surface kind | lower-case domain noun | `sop`, `mailbox`, `scheduler` |
| Summary method | `session.<surface>.summary` | `session.mailbox.summary` |
| Summary event | `session_<surface>_summary` | `session_mailbox_summary` |
| Summary schema | `narada.nars.<surface>_summary.v1` | `narada.nars.mailbox_summary.v1` |
| Affordance contract schema | `narada.nars.<surface>_operator_affordance_contract.v1` | `narada.nars.mailbox_operator_affordance_contract.v1` |
| Runtime summary function | `server<Surface>Summary` | `serverMailboxSummary` |
| Runtime binding finder | `find<Surface>ServerBinding` | `findMailboxServerBinding` |
| Client composable | `use<Surface>Summary` | `useMailboxSummary` |
| Client panel | `<Surface>Panel.vue` | `MailboxPanel.vue` |
| Request frame builder | `buildAgentWebUi<Surface>SummaryFrame` | `buildAgentWebUiMailboxSummaryFrame` |

Use the MCP surface name when it is already the durable domain noun. The `mailbox-mcp` projection is rendered to operators as "Synced Email", but its protocol surface remains `mailbox`.

## Implementation Checklist

For a new MCP-specific panel, touch these places deliberately:

1. `packages/nars-client-projection-contract/src/nars-client-projection-contract.mjs`
   Add the admitted `session.<surface>.summary` method and frame builder.
2. `packages/nars-client-projection-contract/src/nars-client-projection-contract.d.ts`
   Export the frame builder for TypeScript consumers.
3. `packages/nars-client-projection-contract/src/nars-client-projection-contract.test.mjs`
   Assert the method is admitted and the frame builder shape is stable.
4. `packages/carrier-runtime/src/surface-affordances.mjs`
   Detect the surface from explicit MCP metadata or a temporary live tool inventory inference.
5. `packages/carrier-runtime/src/surface-affordances.test.mjs`
   Assert the generated affordance includes `surface_kind`, `panel.summary_method`, `actions`, and `tools`.
6. `packages/carrier-runtime/src/runtime-dependencies.mjs`
   Handle the summary request, call MCP tools through the mounted runtime fabric, normalize the DTO, and emit the summary event.
7. `packages/carrier-runtime/src/server-mode-mcp.test.mjs`
   Assert the emitted DTO shape, including normal, empty/unavailable, and optional-tool behavior where relevant.
8. `packages/agent-web-ui/src/agent-web-ui.js` and `packages/agent-web-ui/src/app/lib/narsFrames.ts`
   Re-export and wrap the new request frame.
9. `packages/agent-web-ui/src/app/composables/use<Surface>Summary.ts`
   Read the latest summary event and normalize defensive defaults for the UI.
10. `packages/agent-web-ui/src/app/components/<Surface>Panel.vue`
    Render the read-only panel. Do not call MCP or mutate authority from the browser.
11. `packages/agent-web-ui/src/app/App.vue`, `NarsSessionShell.vue`, and `SiteInfoPanel.vue`
    Wire the panel, trigger, refresh event, and Site-panel link.
12. `packages/agent-web-ui/test/agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs`
    Assert panel wiring and request frame admission.
13. `docs/concepts/nars-client-projection-contract.md` and this document
    Document the summary payload, action posture, and any boundary decisions.

Focused verification should normally include the projection-contract test/typecheck, carrier-runtime test/typecheck, and agent-web-ui test/typecheck. Run the agent-web-ui build when the panel changes browser-rendered code.

## Worked Third-Panel Example

Suppose adding a read-only scheduler panel.

1. Detect the MCP surface by `scheduler_task_list` or an explicit `operator_affordance` advertised by the scheduler MCP.
2. Add `session.scheduler.summary` and emit `session_scheduler_summary`.
3. Normalize a DTO such as:

```json
{
  "schema": "narada.nars.scheduler_summary.v1",
  "event": "session_scheduler_summary",
  "status": "ok",
  "server_name": "narada-sonar-scheduler",
  "tasks": { "count": 3, "items": [] },
  "errors": []
}
```

4. Render `SchedulerPanel.vue` from the summary event. Initial actions should be `refresh` and local `open_task` only.
5. Treat enable/disable/delete as candidate mutations until NARS owns explicit admitted protocol methods for those operations.

This example is intentionally read-only. Its purpose is to prove discoverability, DTO stability, and rendering before adding mutating workflow.

## Affordance Metadata Source

Long term, MCP-specific UI affordances should be declared by the MCP surface when the surface has a stable operator presentation contract. NARS should project that declaration, validate it, and fill in runtime facts such as mounted server name and available tools.

Live tool inventory inference is acceptable as a compatibility bridge for existing surfaces. It should be conservative, tested, and easy to remove once the MCP advertises explicit `operator_affordance` or `surface_affordance` metadata.

The preferred order is:

1. Explicit MCP server config or tool annotations: stable source of panel intent.
2. NARS compatibility inference from known tool names: temporary bridge for known first-party surfaces.
3. Client-side guessing: not allowed for load-bearing panels.

The browser may choose layout and visual treatment, but it must not decide that an MCP surface exists or infer authority from tool names by itself.
