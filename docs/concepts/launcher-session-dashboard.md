# Launcher Session Dashboard

## Purpose

This document defines the target shape for the browser page opened by `workspace-launch --interactive-selection-ui`.

The page is not only a selection form. In persistent mode it is a **Launcher Session Dashboard**: a local operator surface that records what the operator asked the launcher to do, what the launcher handed off to the host, what runtime/projection records later became discoverable, and which lifecycle actions are actually admitted.

The dashboard exists to avoid three recurring operator-facing failures:

- successful launches disappearing from the page that initiated them;
- terminal/process handoff being confused with runtime ownership;
- raw process killing being presented as if it were a coherent lifecycle action.

## Target Shape

The Launcher Session Dashboard is a local, browser-rendered **operator coordination surface** for workspace launch sessions. It has one job: keep the operator oriented across repeated launch selections and the evidence those selections produce.

It factors launch UX into this shape:

```text
Launcher UI Session
  -> Launch Attempt(s)
      -> Host Handoff evidence
      -> Runtime Observation(s)
      -> Projection Observation(s)
      -> Admitted Lifecycle Action(s)
```

This factorization is the core contract. A successful host handoff is not a runtime. A runtime is not an operator projection. A projection is not ownership of the runtime. The dashboard may join these records for display, but it must preserve their separate authorities in data, API shape, and UI labels.

The target page is therefore both:

- a **selection form** for submitting more launch attempts; and
- a **session dashboard** showing what this launcher session has launched, handed off, discovered, and can coherently act on.

## Non-Goals

The dashboard is not:

- a NARS runtime host;
- the authoritative NARS session index;
- a process supervisor;
- a task lifecycle board;
- a generic terminal tab manager;
- a Cloudflare projection registry;
- a substitute for Site-local MCP or NARS health authority.

When the dashboard displays runtime/projection state, it is displaying observations from the owning authority. It does not become that authority.

## Related Authority Surfaces

- [`process-launch-posture.md`](../architecture/process-launch-posture.md) defines process-launch posture, host visibility, and launch evidence.
- [`nars-session-management.md`](nars-session-management.md) defines NARS session discovery, liveness, health, artifacts, and attachment.
- [`nars-client-projection-contract.md`](nars-client-projection-contract.md) defines client projection contracts for `agent-cli`, `agent-tui`, `agent-web-ui`, and future surfaces.
- [`narada-runtime-projection-graph.md`](narada-runtime-projection-graph.md) defines the authority/projection topology this dashboard observes.

## Boundary

The Launcher Session Dashboard is owned by `@narada2/cli` and the User Site launcher path. It is a launcher/operator surface, not a NARS runtime, not a NARS session store, not a task lifecycle surface, and not a general process manager.

It may display:

- launch selections submitted through this dashboard session;
- launch plans and execution handoffs produced by Narada CLI;
- NARS sessions discovered through Site-local session management;
- operator projections discovered through NARS/client projection records;
- lifecycle actions admitted by the owning authority.

It must not display guessed process ownership as fact. If a process, terminal tab, NARS session, or projection cannot be tied to explicit launcher/session evidence, it is `observed_unowned` or absent from the dashboard.

## Implementation Boundary

The browser renderer is the private `@narada2/workspace-launch-ui` package. It
uses the shared `@narada2/ui` foundation and the `@narada2/ui-vue` Vue
adapter. Its native controls are intentionally semantic and are styled by the
shared foundation; the adapter's generated shadcn-vue primitives remain
available for controls that need richer behavior. The package owns
presentation, selection controls, dashboard rendering, and bounded browser
requests only.

`@narada2/cli` remains the authority for the HTTP server, selection
normalization, launch planning, process handoff, persistence, runtime
observation, and lifecycle actions. The renderer must not acquire those
responsibilities. The existing endpoint contract remains:

- `GET /` for the bootstrapped dashboard document;
- `GET /launches` for the current session projection;
- `POST /selector-model` for capability-dependent selector options;
- `POST /submit` for a new launch attempt;
- `POST /launches/<launch-attempt-id>/<action>` for admitted result actions;
- `POST /cancel` to close the launcher UI session.

The direct launcher URL remains a diagnostic endpoint until the Operator
Router admits a launcher-session route keyed by `ui_session_id`.

## Dashboard Layers

The page separates four layers. The separation is mandatory because each layer has a different authority.

| Layer | Authority | Meaning | Example status |
| --- | --- | --- | --- |
| Launcher UI Session | CLI HTTP server for one `--interactive-selection-ui` process | The browser dashboard session itself. | `open`, `closing`, `closed`, `timeout` |
| Launch Attempt | Narada CLI workspace launcher | One submitted selection and its planning/execution result. | `queued`, `planning`, `launching`, `launched`, `failed` |
| Host Handoff | Process-launch posture substrate | A visible OS handoff such as Windows Terminal or browser open. | `planned`, `handed_off`, `failed`, `unknown_after_handoff` |
| Runtime/Projection Observation | NARS session management and projection contracts | What became discoverable after launch. | `waiting`, `healthy`, `unhealthy`, `closed`, `observed_unowned` |

## Canonical Lifecycle

The dashboard lifecycle is intentionally small.

```text
open
  -> submit selection
  -> create Launch Attempt queued
  -> plan and validate selection
  -> create Host Handoff planned
  -> execute admitted handoff
  -> mark Launch Attempt launched or failed
  -> observe runtime/projection state when available
  -> admit actions from observed authority
  -> recheck, retry, forget, or close dashboard
```

The lifecycle has two important asymmetries:

- `Retry` creates a new `WorkspaceLaunchAttempt`; it does not mutate the old attempt back to `queued`.
- `Forget` mutates only dashboard visibility/state; it does not stop runtime hosts, terminals, browser pages, or projections.

The dashboard may display stale or partial observations, but it must label them as such. It must not promote `waiting` to `healthy`, `handed_off` to `running`, or `observed_unowned` to `owned` without evidence from the authority that owns that claim.

## Identity And Correlation

Each launch attempt must preserve the operator's submitted selection exactly enough to explain what was requested later:

- selected Site(s);
- selected Role(s);
- selected operator surface(s);
- selected runtime host;
- selected intelligence provider;
- selected registry/config path(s);
- timestamp and UI session id.

Correlation from launch attempt to runtime/projection records is evidence-based and best-effort:

1. Start with launch selection and handoff timestamps.
2. Narrow by selected Site root and agent/role.
3. Prefer NARS session index records over terminal output.
4. Verify liveness through health endpoints before showing `healthy`.
5. Attach projection observations only when the projection contract names a session or attach endpoint.

If correlation finds multiple candidates, the row should show `ambiguous` or require operator selection. It must not silently pick a runtime just because it is the newest process.

## User Experience Target

The first viewport has two stable regions:

1. **Launch Form**
   - Site multi-select.
   - Role multi-select filtered by selected Site(s).
   - Operator surface multi-select.
   - Runtime selector.
   - Intelligence provider selector.
   - Launch button.

2. **Launched Panel**
   - A chronological list of launch attempts from the current dashboard session.
   - Each row/card shows launch selection, handoff state, discovered runtime/projection state, and admitted actions.

The form remains available after a successful launch. The Launched panel updates in-place after each submit.

### Row Examples

Successful NARS launch with projections:

```text
Sonar / resident
agent-cli + agent-web-ui · narada-agent-runtime-server · codex-subscription
Launch accepted 12:04:31
Runtime: healthy · session carrier_...
Surfaces: agent-cli attached, agent-web-ui open
Actions: Open Web UI · Attach CLI · Stop Runtime · Forget
```

Terminal handoff before runtime discovery:

```text
Smart Scheduling / resident
agent-cli · narada-agent-runtime-server
Terminal handoff succeeded
Runtime: waiting for session discovery
Actions: Recheck · Forget
```

Failed launch:

```text
Sonar / architect
agent-cli · narada-agent-runtime-server · codex-subscription
Launch failed: codex-subscription auth unavailable
Actions: Show details · Retry · Forget
```

Unowned discovered runtime:

```text
Sonar / resident
NARS session carrier_...
Observed outside this launcher dashboard
Actions: Attach Web UI · Attach CLI · Forget Observation
```

The unowned row must not offer `Stop Runtime` unless the runtime authority admits a stop action independently of dashboard ownership.

## First-Class Records

### `WorkspaceLaunchUiSession`

One browser dashboard process.

```json
{
  "schema": "narada.workspace_launch.ui_session.v1",
  "ui_session_id": "wls_...",
  "started_at": "2026-07-05T00:00:00.000Z",
  "status": "open",
  "url": "http://127.0.0.1:12345",
  "registry_paths": ["C:/Users/Andrey/Narada/config/launch/agents.psd1"],
  "owner": {
    "package": "@narada2/cli",
    "command": "launcher workspace-launch",
    "surface": "interactive-selection-ui"
  }
}
```

### `WorkspaceLaunchAttempt`

One submitted selection and its outcome.

```json
{
  "schema": "narada.workspace_launch.attempt.v1",
  "launch_attempt_id": "wla_...",
  "ui_session_id": "wls_...",
  "submitted_at": "2026-07-05T00:00:01.000Z",
  "selection": {
    "site": ["sonar"],
    "role": ["resident"],
    "operator_surface": ["agent-cli", "agent-web-ui"],
    "runtime": "narada-agent-runtime-server",
    "intelligence_provider": "codex-subscription"
  },
  "status": "launched",
  "result_summary": "launched 1 workspace launch(es)",
  "plan_result_path": null,
  "handoffs": [],
  "observations": [],
  "actions": []
}
```

### `WorkspaceLaunchHandoff`

One process-launch posture handoff produced by a launch attempt.

```json
{
  "schema": "narada.workspace_launch.handoff.v1",
  "handoff_id": "wlh_...",
  "launch_attempt_id": "wla_...",
  "posture": "operator_terminal",
  "status": "handed_off",
  "command": "wt",
  "argv_redacted": ["new-tab", "--title", "Sonar Resident", "..."],
  "cwd": "D:/code/narada.sonar",
  "exit_code": 0,
  "ownership_posture": "handoff_only",
  "diagnostic_ref": null
}
```

`handoff_only` means the launcher successfully started or asked the host to start something, but does not thereby own the ultimate runtime or terminal tab lifecycle.

### `WorkspaceLaunchObservedRuntime`

Runtime evidence derived after handoff.

```json
{
  "schema": "narada.workspace_launch.observed_runtime.v1",
  "observation_id": "wlr_...",
  "launch_attempt_id": "wla_...",
  "kind": "nars",
  "session_id": "carrier_...",
  "site_root": "D:/code/narada.sonar",
  "health": "healthy",
  "authority": "nars_session_management",
  "ownership_posture": "owned_by_runtime_authority",
  "last_checked_at": "2026-07-05T00:00:05.000Z"
}
```

### `WorkspaceLaunchObservedProjection`

Projection evidence derived from NARS/client projection records.

```json
{
  "schema": "narada.workspace_launch.observed_projection.v1",
  "observation_id": "wlp_...",
  "launch_attempt_id": "wla_...",
  "projection_kind": "agent-web-ui",
  "session_id": "carrier_...",
  "status": "attached",
  "url": "http://127.0.0.1:56789",
  "authority": "nars_client_projection_contract",
  "ownership_posture": "owned_by_projection_authority"
}
```

## Status Semantics

Launch attempt statuses:

| Status | Meaning |
| --- | --- |
| `queued` | UI accepted the operator selection but planning has not started. |
| `planning` | CLI is resolving registry/config/selection into launch plans. |
| `launching` | CLI is executing the admitted host handoff. |
| `launched` | Host handoff succeeded. Runtime may still be undiscovered. |
| `failed` | Planning or handoff failed. No success should be implied. |
| `forgotten` | Operator removed the dashboard row without lifecycle mutation. |

Handoff statuses:

| Status | Meaning |
| --- | --- |
| `planned` | Handoff argv/request exists but was not executed. |
| `handed_off` | OS handoff command returned success. |
| `failed` | Handoff command failed or was refused. |
| `unknown_after_handoff` | Handoff succeeded but no further runtime/projection evidence is available. |

Runtime/projection statuses are read from their authority where possible. The dashboard may display `waiting` while polling for discovery, but it must not turn waiting into failure without a bounded timeout and clear reason.

## Actions

Actions are lifecycle requests, not arbitrary process operations.

| Action | Meaning | Admission rule |
| --- | --- | --- |
| `Open Web UI` | Open or attach an agent-web-ui projection for a discovered NARS session. | Requires attachable NARS session or attach command. |
| `Attach CLI` | Open or print an agent-cli attach command. | Requires attachable NARS session. |
| `Recheck` | Refresh runtime/projection observations. | Always safe for local records. |
| `Retry` | Re-submit the same selection as a new launch attempt. | Requires original selection and current config admission. |
| `Forget` | Hide/delete dashboard record only. | Does not mutate runtime/projection lifecycle. |
| `Stop Runtime` | Ask the runtime authority to stop the NARS session. | Requires an admitted NARS session control path and appends `session.close`. |
| `Stop Projection` | Ask projection authority to close/detach one projection. | Requires projection ownership evidence or projection lifecycle endpoint. |
| `Kill Process` | Emergency OS termination. | Break-glass diagnostics only; requires exact owned PID/process tree evidence and explicit operator confirmation. |

Primary UI labels should be `Stop Runtime` and `Stop Projection`, not `Kill`. Raw killing is an implementation fallback, not the normal operator concept.

## Endpoints

The persistent browser dashboard should expose local endpoints:

```text
GET  /launches
POST /submit
POST /launches/:launchAttemptId/recheck
POST /launches/:launchAttemptId/retry
POST /launches/:launchAttemptId/forget
POST /launches/:launchAttemptId/stop-runtime
POST /launches/:launchAttemptId/stop-projection
POST /cancel
```

Initial implementation may poll `GET /launches`. SSE or WebSocket is optional because launcher dashboard state is low-volume and local. This is separate from NARS `session.events.subscribe`, which streams agent session events.

Endpoint responses should be structured and operator-renderable. The browser should not have to infer meaning from a raw launch result object.

`GET /launches` returns the current dashboard state:

```json
{
  "schema": "narada.workspace_launch.ui_session_state.v1",
  "ui_session": { "schema": "narada.workspace_launch.ui_session.v1" },
  "attempts": [],
  "observed_unowned": [],
  "actions": []
}
```

`POST /submit` returns the new attempt plus the refreshed dashboard state:

```json
{
  "schema": "narada.workspace_launch.submit_result.v1",
  "status": "launched",
  "attempt": { "schema": "narada.workspace_launch.attempt.v1" },
  "dashboard": { "schema": "narada.workspace_launch.ui_session_state.v1" }
}
```

Refused lifecycle endpoints should return a refusal object, not a thrown stack or unstructured string:

```json
{
  "schema": "narada.workspace_launch.action_refusal.v1",
  "status": "refused",
  "reason_code": "runtime_lifecycle_not_admitted",
  "message": "Stop Runtime requires an admitted NARS lifecycle endpoint."
}
```

The UI should render refusal messages as row-local action results. It should reserve raw JSON for expandable diagnostics.

## Persistence

The first implementation may keep dashboard state in the in-memory CLI HTTP process. The target persistent location is User Site runtime state because the dashboard is launched from the User Site launcher path and spans multiple configured Sites.

Target path shape:

```text
<user-site-root>/.narada/runtime/workspace-launch-ui-sessions/<ui-session-id>/
  session.json
  attempts.jsonl
  handoffs.jsonl
  observations.jsonl
```

Persistence is for recovery and operator visibility. It does not make the dashboard the authority for NARS liveness or projection lifecycle.

## Discovery And Refresh

After each successful handoff, the dashboard should attempt to correlate the launch attempt to runtime/projection records:

1. Use selected Site root(s) and `@narada2/site-paths` to locate NARS session storage.
2. Read session index projections for candidate sessions matching site, agent, role, and recent start time.
3. Verify candidate liveness through NARS health before showing `healthy`.
4. Read or derive attach commands from NARS session management.
5. Mark unmatched launches as `unknown_after_handoff` or `waiting`, not failed, until a timeout or error is explicit.

The dashboard must prefer runtime/session authority over terminal handoff state. A successful `wt` handoff is not proof that NARS started.

## Failure Modes To Prevent

- **Phantom ownership**: showing Stop/Kill for processes the dashboard cannot identify or did not launch.
- **Terminal equals runtime**: treating Windows Terminal success as NARS health.
- **Silent launch**: accepting a launch but not adding a dashboard row.
- **Handoff-only stuckness**: leaving rows forever in ambiguous state without `Recheck`, details, and timeout reason.
- **Raw object dumping**: rendering full JSON launch results as primary UI instead of concise status with expandable diagnostics.
- **Cross-Site confusion**: grouping unrelated Sites into one row because they were launched from one multi-select submit.
- **Dangerous kill affordance**: presenting raw process kill as a normal action without ownership evidence.

## Test Requirements

A first-class implementation must have E2E coverage proving:

1. The page opens from `workspace-launch --interactive-selection-ui`.
2. The page submits at least two distinct launch selections over time.
3. Each submit creates a visible launch attempt row.
4. Each submit records a launch handoff/result.
5. The page remains usable after the first launch.
6. Cancel closes the dashboard process cleanly.
7. `Forget` removes dashboard state without lifecycle mutation.
8. Stop actions are absent unless ownership/admission evidence exists.

Existing proof for multi-submit persistence lives in `packages/layers/cli/test/integration/workspace-selection-ui-e2e.test.mjs`. Future stop/recheck/forget features must extend that E2E instead of relying only on unit tests.

## Acceptance Slices

The target should be implemented in coherent slices. Each slice must preserve the authority boundaries above.

### Slice 1 - Persistent Selection Page

Status: implemented.

Acceptance:

- Browser page opens from `workspace-launch --interactive-selection-ui`.
- The page can submit more than one launch over time.
- The page remains open after a successful submit.
- Cancel closes the CLI HTTP process cleanly.

### Slice 2 - In-Memory Dashboard Records

Status: implemented for current dashboard-session memory.

Acceptance:

- `GET /launches` returns `WorkspaceLaunchUiSession` and visible `WorkspaceLaunchAttempt` records.
- Every `/submit` creates a row before or during execution, so a launch is never silent.
- A successful launch records `WorkspaceLaunchHandoff` separately from runtime observations.
- A failed launch records a failure row with retry/forget actions.
- Stop actions are absent unless admission evidence exists.

### Slice 3 - Browser Launched Panel

Status: implemented for attempt rows, handoff rows, waiting runtime observations, details, `Recheck`, `Retry`, and `Forget`.

Acceptance:

- The page renders a chronological Launched panel below the form.
- Rows show selection, attempt status, handoff status, observation status, and admitted actions.
- Raw JSON appears only in expandable details.
- `Forget` removes the row from dashboard state without lifecycle mutation.

### Slice 4 - NARS Correlation And Recheck

Status: implemented for represented runtime and projection authorities. `Recheck` refreshes observations from Site-local NARS session-index records and shows `waiting`, `healthy`, `unhealthy`, `closed`, `unknown_after_handoff`, or `ambiguous`. Health classification uses live HTTP health probes when a session health endpoint is present. Attachable sessions expose `Open Web UI` and `Attach CLI` actions that execute visible operator-terminal handoffs from session-authority attach commands and record projection observations. Because the current projection authority exposes attach commands but not attach/detach lifecycle ownership, projection observations remain `handoff_only` instead of being promoted to owned/attached state.

Acceptance:

- `Recheck` refreshes observations from Site-local NARS session management.
- Healthy runtime state requires verified health evidence.
- Ambiguous candidate sessions are shown as ambiguous instead of guessed.
- `Open Web UI` and `Attach CLI` appear only for attachable sessions, execute visible projection handoffs from session authority, and record `WorkspaceLaunchObservedProjection` rows.

### Slice 5 - Authority-Backed Stop Actions

Status: implemented for represented lifecycle authorities. `Stop Runtime` is exposed only when the dashboard discovered an existing NARS session control path for the runtime observation; the action appends a `session.close` protocol frame to that control path. `Stop Projection` remains absent/refused unless a future projection lifecycle endpoint is represented in the projection authority.

Acceptance:

- `Stop Runtime` is exposed only when NARS admits a session lifecycle stop request.
- `Stop Projection` is exposed only when projection authority admits a detach/close request.
- Raw `Kill Process` remains break-glass diagnostics and requires exact owned process evidence plus explicit operator confirmation.

### Slice 6 - Recovery Persistence

Status: implemented for bounded local dashboard recovery. The dashboard writes `session.json`, `attempts.jsonl`, `handoffs.jsonl`, `observations.jsonl`, and `projections.jsonl` under User Site runtime state. A restarted dashboard loads the latest compatible persisted dashboard session and renders its remaining launch attempts. Old dashboard sessions are pruned under the dashboard persistence root without mutating NARS sessions or projection processes.

Acceptance:

- Dashboard state can be recovered from User Site runtime storage after a browser refresh or dashboard restart.
- Persistence does not become runtime truth; NARS session management remains authoritative for liveness.
- Old sessions can be pruned without affecting NARS sessions or operator projections.

## Implementation Order

1. Keep the existing persistent selection page and E2E.
2. Add in-memory `WorkspaceLaunchAttempt` records and `GET /launches`.
3. Render the Launched panel from `GET /launches` instead of only a transient status message.
4. Split handoff evidence from runtime observation.
5. Add Site-local NARS correlation and `Recheck`.
6. Add `Forget`.
7. Add `Stop Runtime` only after NARS exposes an admitted lifecycle endpoint.
8. Add `Stop Projection` only after projection ownership/lifecycle is explicit.
9. Load dashboard recovery state from User Site runtime storage.

## Confidence

CL 0.99: the dashboard should show launch attempts and discovered runtime/projection state on the launcher page.

CL 0.99: raw `Kill Process` must not be the primary UX; `Stop Runtime` and `Stop Projection` are the coherent lifecycle actions.

CL 0.985: polling `GET /launches` is sufficient for the launcher dashboard; NARS event streaming remains separate.

CL 0.98: User Site runtime state is the right long-term persistence locus for dashboard recovery, while NARS Site-local session records remain the source of runtime truth.
