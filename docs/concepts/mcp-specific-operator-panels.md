# MCP-Specific Operator Panels

## Purpose

MCP-specific operator panels are read-oriented projections of authority MCP surfaces into operator UIs such as `agent-web-ui`. They make a surface understandable without turning the browser into the authority or making raw MCP tools the UI contract.

SOP is the reference workflow implementation. Synced Email is the reference read-only synced-record implementation over `mailbox-mcp`. Together they prove the pattern for future panels such as task lifecycle, scheduler, artifacts, or richer mail views.

Graph Mail is intentionally not a first-wave standalone browser panel. It is a live Microsoft Graph authority surface with read tools and high-impact mutation tools on the same MCP boundary. First-wave mail UI remains Synced Email unless a narrower Graph Mail projection is explicitly admitted.

## Target Shape

The pattern has four layers:

```text
MCP authority surface
  -> NARS read-side summary request
  -> typed projection DTO/event
  -> client panel renderer
```

The browser asks NARS for a summary, not for direct MCP calls. NARS crosses into the mounted Site MCP fabric through its admitted runtime boundary, normalizes the result into a stable DTO, emits a session event, and the client renders that event.

No participant treats another authority zone as an internal library. Even when the implementation is local process IPC or an in-process helper, the architectural shape is an admitted crossing:

```text
Operator UI zone
  -> admitted UI/NARS request
NARS session/runtime zone
  -> admitted NARS/MCP-fabric crossing
MCP surface authority zone
  -> surface-owned read command
NARS session/runtime zone
  -> normalized projection event/DTO
Operator UI zone
  -> render
```

Therefore a panel should reflect the MCP surface's own domain read commands, but only through NARS-owned projection methods. The UI must not call MCP directly, and NARS must not invent parallel domain readers when the MCP surface already owns the domain command.

## Required Pieces

| Piece | Owner | Example |
| --- | --- | --- |
| Surface detection | NARS / carrier runtime | Detect SOP by `sop_template_list` or `sop_run_list`; detect synced email by `mailbox_accounts_list` or `mailbox_messages_list`; detect scheduler by `scheduler_task_list` or `scheduler_task_show`; detect task lifecycle by `task_lifecycle_workboard_snapshot` or `task_lifecycle_obligations`. |
| Affordance declaration | NARS projection over MCP metadata | `session.surface.affordances` with panel sections and available action names. |
| Summary method | NARS protocol | `session.sop.summary`, `session.mailbox.summary`, `session.scheduler.summary`, `session.task_lifecycle.summary`. |
| Summary event | NARS event stream | `session_sop_summary`, `session_mailbox_summary`, `session_scheduler_summary`, `session_task_lifecycle_summary`. |
| Client consumption | Agent web UI | `useSopSummary` reads the latest summary event. |
| Panel rendering | Agent web UI | `SopPanel.vue`, `MailboxPanel.vue`, `SchedulerPanel.vue`, `TaskLifecyclePanel.vue`. |
| Contract docs/tests | Shared packages | Runtime DTO tests and web UI rendering tests. |

## Implemented Panel Inventory

This table is the current load-bearing inventory for first-party operator panels. It is intended to make drift visible: every implemented panel should have a NARS request method, a NARS event, an authority read source, and focused tests.

| Operator panel | NARS summary method | Summary event | Authority read source | Runtime test posture | Web UI test posture |
| --- | --- | --- | --- | --- | --- |
| SOP | `session.sop.summary` | `session_sop_summary` | SOP MCP template/run list tools through the mounted MCP binding | `server-mode-mcp.test.mjs` covers summary emission and DTO shape | `agent-web-ui.test.mjs`, `agent-web-ui-protocol.test.mjs`, and panel e2e coverage assert request wiring and rendering |
| Synced Email / Mailbox | `session.mailbox.summary` | `session_mailbox_summary` | `mailbox-mcp` account/message read tools through the mounted MCP binding | `server-mode-mcp.test.mjs` covers normal and missing optional doctor behavior | `agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs` assert request wiring and read-only panel rendering |
| Scheduler | `session.scheduler.summary` | `session_scheduler_summary` | Scheduler MCP task/history read tools through the mounted MCP binding | `server-mode-mcp.test.mjs` covers summary emission and DTO shape | `agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs` assert request wiring and read-only panel rendering |
| Task Lifecycle | `session.task_lifecycle.summary` | `session_task_lifecycle_summary` | Task Lifecycle MCP list/obligation/read tools through the mounted MCP binding | `server-mode-mcp.test.mjs` covers summary emission and DTO shape | `agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs` assert request wiring and read-only panel rendering |
| Inbox | `session.inbox.summary` | `session_inbox_summary` | Inbox MCP envelope read tools through the mounted MCP binding | `server-mode-mcp.test.mjs` covers summary emission and DTO shape | `agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs` assert request wiring and read-only panel rendering |
| Delegation | `session.delegation.summary` | `session_delegation_summary` | Delegation MCP worker/task read tools through the mounted MCP binding | `server-mode-mcp.test.mjs` covers summary emission and DTO shape | `agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs` assert request wiring and read-only panel rendering |
| Git | `session.git.summary` | `session_git_summary` | Git MCP status/log read tools through the mounted MCP binding | `server-mode-mcp.test.mjs` covers summary emission and DTO shape | `agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs` assert request wiring and read-only panel rendering |
| Surface Feedback | `session.surface_feedback.summary` | `session_surface_feedback_summary` | Surface Feedback MCP list/stats read tools through the mounted MCP binding | `server-mode-mcp.test.mjs` covers summary emission and DTO shape | `agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs` assert request wiring and read-only panel rendering |
| Artifacts | `session.artifacts.summary` | `session_artifacts_summary` | NARS session artifact index, because artifacts are NARS-owned rather than MCP-surface-owned | `server-mode-mcp.test.mjs` covers summary emission and DTO shape | `agent-web-ui.test.mjs` and `agent-web-ui-protocol.test.mjs` assert request wiring and read-only panel rendering |

The Artifacts row is the deliberate exception to the MCP-authority pattern: it uses the same UI projection contract, but its authority source is the NARS session artifact index instead of a mounted MCP surface.

## Non-Panel Surface Boundaries

Not every MCP surface should become an operator panel. First-wave panels are for bounded read-side summaries. Surfaces that primarily expose command execution, broad filesystem access, live mailbox mutation, or low-level diagnostics should stay behind explicit agent/NARS authority flows until a narrower read projection is admitted.

| Surface family | Current panel posture | Rationale |
| --- | --- | --- |
| Local filesystem | No generic file browser panel | A generic browser file panel would turn broad filesystem authority into UI authority. Specific outputs should appear as artifacts, Site metadata, or domain panels. |
| Structured command / shell | No generic command-runner panel | Command execution needs explicit authority, admission, and audit semantics. A browser panel may show bounded diagnostics later, but not arbitrary execution controls. |
| Speech | No standalone first-wave panel | Speech is an operator interaction capability and preference surface. It belongs in Site/agent preferences before it needs a dedicated MCP read panel. |
| Site ops / site probe | Covered by Site info and health posture for now | These are low-level diagnostics. A future Site Diagnostics panel should use a narrow NARS summary method, not raw tool output. |
| MCP loader / registrar / site coherence / Cloudflare carrier | No generic panel by default | These are administrative or deployment authority surfaces. Any UI must be explicit, narrow, and separately admitted. |
| Graph Mail | No standalone first-wave panel | Live Graph reads and mutations share a surface. Use Synced Email for read-only mail state; add only narrow Graph projections when explicitly admitted. |

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

Mutating actions must not call MCP directly from the browser or bypass the owning authority zone. They require a NARS protocol method, an admitted NARS/MCP crossing, and explicit authority-surface admission. The UI can display the action only as a candidate until that admission path exists. Observation panels should remain read-oriented by default.

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

For Graph Mail:

| Action | Current posture |
| --- | --- |
| `graph_mail_doctor` | Safe diagnostic read, but not enough to justify a standalone panel. |
| `graph_mail_query`, `graph_mail_message_show`, `graph_mail_attachment_list`, `graph_mail_attachment_get` | Live Graph reads; first-wave browser projection is deferred because these can expose live mailbox content and should not be confused with synced records. |
| draft create/reply/update/discard/send and attachment add/upload/delete | Out of scope for browser panels. These require explicit authority flows and must not be introduced through a generic MCP panel. |

Decision: Graph Mail remains behind explicit agent/NARS authority flows and may be linked contextually from Synced Email only as a future admitted read-only detail projection. The safe future candidate is a narrow `session.graph_mail.draft_status.summary` or `session.graph_mail.live_read.summary` that exposes bounded metadata only, never raw message bodies or send/delete actions by default.

For Scheduler:

| Action | Current posture |
| --- | --- |
| `refresh` | Read projection request through `session.scheduler.summary`. |
| `open_task` / `open_history` | Local panel expansion or future read-only detail request. |
| `run_now`, `enable_task`, `disable_task`, `delete_task` | Candidate mutations only; require explicit NARS admission before execution. |

For Task Lifecycle:

| Action | Current posture |
| --- | --- |
| `refresh` | Read projection request through `session.task_lifecycle.summary`. |
| `open_task` / `search_tasks` | Local panel inspection or future read-only detail request. |
| `claim_task`, `finish_task`, `close_task`, `defer_task` | Candidate mutations only; require explicit NARS admission before execution. |

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

## Boundary Decisions

### Graph Mail

Graph Mail MCP currently combines live reads (`graph_mail_query`, `graph_mail_message_show`, attachment list/get) with live mailbox mutations (draft create/reply/update/discard/send and attachment add/upload/delete). That makes a generic browser panel unsafe for the first wave: it would blur read-only synced mailbox state with live Graph authority, and it would invite accidental exposure of message bodies or mutation controls.

First-wave decision:

- no standalone Graph Mail panel in `agent-web-ui`;
- no Graph Mail browser mutation path;
- no body-content projection through Graph Mail by default;
- Synced Email remains the operator mail panel for read-only mailbox state;
- future Graph Mail UI must be a separate, narrow, NARS-admitted projection with an explicit method name and tests for redaction, bounded fields, and mutation absence.

Potential follow-up task if/when needed: add a read-only Graph Mail draft/status projection that exposes only mailbox id, draft/message id, subject, timestamp, recipient counts, attachment counts, and policy posture, with no body content and no send/discard/update controls.
