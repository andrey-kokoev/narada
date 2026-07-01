# NARS Session Management

## Purpose

This document defines the full target shape for local NARS session discovery, liveness, attachment, and recovery. It is the implementation checklist for turning one launched `narada-agent-runtime-server` session into something other operator surfaces can find and attach to without depending on terminal windows, ambient Codex config, or `agent-cli` process state.

The runtime contract remains in [`nars-runtime-contract.md`](nars-runtime-contract.md). This document expands only the session-management slice. Remote browser access through Cloudflare or another public ingress is a separate projection/admission boundary described in [`cloudflare-nars-web-projection.md`](cloudflare-nars-web-projection.md), with the narrower gateway slice in [`nars-remote-projection-gateway.md`](nars-remote-projection-gateway.md).

## Target Outcome

A local operator or automation caller can:

1. Start a NARS-backed Agent Session through the launcher.
2. Discover live or recently closed NARS sessions for one Site.
3. Discover sessions across known Sites when no Site is specified.
4. Verify candidate liveness through a health endpoint before attach.
5. Attach peer projections such as `agent-cli`, `agent-tui`, or `agent-web-ui` to the same NARS session.
6. Recover useful evidence after crash or unclean process exit.

The target does not require a global daemon. It requires durable Site-local projection files plus a clear way to enumerate known Site roots.

## Ownership

| Concern | Owner |
| --- | --- |
| Public session-management schema | NARS contract, documented under `docs/concepts/`. |
| Runtime process binding and event emission | `@narada2/agent-runtime-server`. |
| Current in-process helper implementation | `@narada2/carrier-runtime`, until extraction completes. |
| Launch materialization and initial session id | `@narada2/agent-start`. |
| Client attach commands and projection capabilities | `@narada2/nars-client-projection-contract`. |
| Terminal/browser/TUI rendering | Client projection packages. |
| Known Site root enumeration | Narada CLI using User Site launch registry, known-site registry, explicit config, or explicit CLI arguments. |

Client code must depend on NARS session-management schemas and endpoints, not on the current helper file placement inside `carrier-runtime`.

## Identity And Compatibility

Public APIs should use `session_id` and the phrase `NARS session id`.

Current launch materialization still creates ids shaped like `carrier_...` and exports `NARADA_CARRIER_SESSION_ID`. Compatibility fields remain valid:

```json
{
  "session_id": "carrier_...",
  "carrier_session_id": "carrier_..."
}
```

Do not introduce `carrier_session_index` or make clients infer that `carrier_` means the session is owned by `agent-cli`.

## Site-Local Storage

Each Site stores NARS session evidence under:

```text
<site-root>/.narada/crew/nars-sessions/<session-id>/
  control.jsonl
  session.jsonl
  events.jsonl
  heartbeat.json
  session-index-record.json
  artifacts/index.json
```

The aggregate index lives at:

```text
<site-root>/.narada/crew/nars-sessions/index.json
```

The aggregate is a convenience projection. Per-session records, heartbeats, and events remain sufficient to recover discovery state.

`events.jsonl` is the durable ordered session event log. Live clients may subscribe through the NARS event endpoint, but history and scrollback must page this file through the NARS protocol method `session.events.read`; browser caches and WebSocket replay buffers are projections, not the source of truth. Page readers merge records by `event_sequence`/`sequence` and tolerate overlapping replay.

## Session Artifacts

NARS owns registered artifacts for a session. A message must not ask a browser to render an arbitrary local path or `file://` URL. Instead, NARS registers an admitted artifact, stores a session-scoped artifact id, and serves metadata/content through local NARS endpoints.

Artifacts live under:

```text
<site-root>/.narada/crew/nars-sessions/<session-id>/artifacts/index.json
```

The private record may include a local `source_path`; public metadata returned to clients must not expose that path:

```json
{
  "schema": "narada.nars.artifact_public.v1",
  "artifact_id": "art_...",
  "session_id": "carrier_...",
  "agent_id": "resident",
  "kind": "html",
  "title": "Report preview",
  "content_type": "text/html; charset=utf-8",
  "created_at": "2026-06-30T19:00:00.000Z",
  "access": { "scope": "session", "token_required": false },
  "render": {
    "preferred": "inline",
    "sandbox": {
      "allow_scripts": true,
      "allow_forms": true,
      "allow_same_origin": false,
      "allow_top_navigation": false
    }
  },
  "lifecycle": { "state": "active", "owner": "nars-session" }
}
```

NARS exposes artifact endpoints on the local runtime HTTP origin:

```text
POST /sessions/:sessionId/artifacts
GET  /sessions/:sessionId/artifacts
GET  /sessions/:sessionId/artifacts/:artifactId
POST /sessions/:sessionId/artifacts/:artifactId/message
GET  /sessions/:sessionId/artifacts/:artifactId/content
```

The current implementation admits artifact source paths only under the Site root or the current session directory. HTML content is served with `text/html` and a restrictive sandbox Content-Security-Policy. Missing, stale, unsupported, or unadmitted artifacts return structured JSON errors instead of blank panels.

Assistant messages reference artifacts as structured parts:

```json
{
  "event": "assistant_message",
  "content": [
    { "type": "markdown", "text": "Here is the generated report:" },
    {
      "type": "artifact_ref",
      "artifact_id": "art_...",
      "kind": "html",
      "title": "Report preview",
      "render_hint": "inline"
    }
  ]
}
```

String `assistant_message.content` remains valid for backward compatibility. When structured `content[]` is present, clients should render parts in order. `agent-web-ui` renders artifact refs through its `/api/nars` proxy, so iframe previews use NARS-served session artifact URLs rather than local filesystem paths.

The preferred operator-visible presentation path is NARS-owned: after an artifact is registered, `POST /sessions/:sessionId/artifacts/:artifactId/message` appends and broadcasts an `assistant_message` event whose `content[]` includes the `artifact_ref`. MCP clients should use that path, via the artifacts MCP `artifact_present` tool, instead of expecting a model to convert a tool result into structured assistant content.

## Per-Session Record

`session-index-record.json` is the stable discovery projection for one session. Target fields:

```json
{
  "schema": "narada.nars.session_index_record.v1",
  "session_id": "carrier_...",
  "carrier_session_id": "carrier_...",
  "derived_from_event": "session_started",
  "projection_generated_at": "2026-06-23T00:00:00.000Z",
  "agent_id": "sonar.resident",
  "site_id": "sonar",
  "site_id_source": "session_started",
  "site_root": "D:/code/narada.sonar",
  "runtime_kind": "narada-agent-runtime-server",
  "launch_operator_surface_kind": "agent-cli",
  "session_dir": "D:/code/narada.sonar/.narada/crew/nars-sessions/carrier_...",
  "session_path": ".../session.jsonl",
  "events_path": ".../events.jsonl",
  "heartbeat_path": ".../heartbeat.json",
  "event_endpoint": "ws://127.0.0.1:12345/events",
  "health_endpoint": "http://127.0.0.1:12346/health",
  "started_at": "2026-06-23T00:00:00.000Z",
  "last_seen_at": "2026-06-23T00:00:05.000Z",
  "terminal_state": null,
  "terminal_reason": null,
  "status_hint": "alive",
  "status_hint_authority": "discovery_projection_only",
  "attached_projections": null,
  "attached_projections_status": "not_tracked",
  "attach_commands": {
    "agent_cli": "narada-agent-cli --attach ws://127.0.0.1:12345/events",
    "agent_tui": "agent-tui --attach ws://127.0.0.1:12345/events",
    "agent_web_ui": "narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health"
  }
}
```

`launch_operator_surface_kind` records the surface that launched the runtime. It is not the set of currently attached projections.

`attached_projections` is `null` while `attached_projections_status=not_tracked`. This means unknown, not an authoritative empty set. It must not be guessed from generated attach commands.

`status_hint` is not liveness authority. Readers must verify active candidates through `/health` or `session.health` before presenting a session as attachable.

`site_id_source` records whether `site_id` came from launch/runtime context or a compatibility fallback. New runtime paths should prefer explicit launch-provided Site identity over path or agent-id inference.

Local runtime context may carry this explicitly as `siteId`, or through `NARADA_SITE_ID` where environment projection is the launch boundary.

## Aggregate Index

`index.json` is a summary pointer table:

```json
{
  "schema": "narada.nars.session_index.v1",
  "site_root": "D:/code/narada.sonar",
  "generated_at": "2026-06-23T00:00:05.000Z",
  "sessions": [
    {
      "session_id": "carrier_...",
      "agent_id": "sonar.resident",
      "site_id": "sonar",
      "session_dir": ".../carrier_...",
      "record_path": ".../session-index-record.json",
      "heartbeat_path": ".../heartbeat.json",
      "event_endpoint": "ws://127.0.0.1:12345/events",
      "health_endpoint": "http://127.0.0.1:12346/health",
      "started_at": "2026-06-23T00:00:00.000Z",
      "last_seen_at": "2026-06-23T00:00:05.000Z",
      "terminal_state": null,
      "status_hint": "alive"
    }
  ]
}
```

The aggregate must be rebuildable. A missing, stale, or corrupt aggregate must not hide a readable per-session record.

## Write Semantics

On `session_started`, NARS writes the per-session record and updates the aggregate with identity, Site, runtime, endpoints, attach commands, paths, and start time.

On heartbeat, NARS writes `heartbeat.json`. It may update `last_seen_at` and `status_hint` in the per-session record. It should not require aggregate `index.json` writes on every tick; aggregate updates may be coalesced, throttled, or rebuilt lazily.

On explicit `session_closed`, NARS marks `terminal_state`, records `terminal_reason=session_closed`, and updates the per-session record and aggregate.

On normal runtime shutdown without an explicit protocol close event, NARS still marks `terminal_state=closed` with `terminal_reason=runtime_process_exit`. This prevents a naturally ended local process from leaving an apparently live discovery projection behind.

On crash, no close event is required. Readers classify liveness from heartbeat freshness and failed health checks.

Record and aggregate writes should use temp-file plus atomic rename. Aggregate rebuild/write should be serialized with a lightweight Site-local lock or equivalent so concurrent session starts in one Site do not lose each other's records.

## Read Semantics

For one Site, readers should:

1. Read `index.json` if present.
2. Overlay aggregate entries from readable per-session records so stale aggregate fields do not override fresher record data.
3. Rebuild the aggregate when it is missing, corrupt, or fails to cover readable per-session records.
4. Fall back to `events.jsonl` plus `heartbeat.json` for diagnostics.
5. Verify active candidates through HTTP `/health` or the NARS `session.health` method before presenting them as attachable.

For no-argument global discovery, readers should first enumerate known Site roots, then apply the Site-local read flow to each Site.

Reader display classification should be derived from multiple evidence sources:

| Display state | Required evidence |
| --- | --- |
| `active` | `/health` or `session.health` succeeds for the candidate endpoint. |
| `starting_or_degraded` | Health is unavailable but heartbeat is fresh and no terminal state is recorded. |
| `closed` | Per-session record has `terminal_state=closed` and health does not prove a live process. |
| `stale` | No terminal state is recorded, health is unavailable, and heartbeat is stale or missing. |
| `historical` | Only records/events remain and no liveness evidence is fresh enough to imply an active runtime. |

`status_hint` is only a discovery projection hint. It can sort or annotate candidates, but it must not be the sole authority for showing a session as live or attachable.

Known Site root sources, in priority order:

1. Explicit CLI argument, `--site-root <path>`.
2. Registered Site id, `--site <site-id>`, first resolved through the User Site launch registry.
3. Local Site registry, when available.
4. Explicit host/user config for operator surfaces.

No-argument discovery should not scan arbitrary filesystem roots.

## Attach UX

Low-level attach remains endpoint-based:

```text
narada-agent-web-ui --event-endpoint <ws-url> --health-endpoint <http-url>
```

Target Narada CLI UX is discovery-based:

```text
narada nars sessions --site-root D:/code/narada.sonar
narada nars sessions --site sonar
narada nars sessions
narada nars attach-command --site-root D:/code/narada.sonar --session carrier_... --surface agent-web-ui
narada nars attach-command --site sonar --session carrier_... --surface agent-web-ui
narada nars attach-command --session carrier_... --surface agent-web-ui
narada agent-web-ui attach --session carrier_...
narada agent-web-ui attach --site sonar --session carrier_...
```

The implemented discovery path reads Site-local indexes, overlays per-session records, classifies display state, and can resolve a concrete attach command for a chosen projection. The Site can be selected by explicit root with `--site-root`, by registered Site id with `--site`, or omitted to enumerate known Sites from the User Site launch registry, falling back to the local Site registry when the launch registry has no entries. CLI session-list output is a bounded summary projection, with `--limit` controlling how many sessions are printed. Use `narada nars attach-command` to inspect attach mechanics, and use `narada agent-web-ui attach` to start the browser projection directly. The lower-level discovery API remains the full Site-local view.

The selector should prefer active sessions, then recently closed sessions useful for recovery. It should show Site, agent id, role, started time, liveness state, and launch surface.

## Implementation Slices

1. Add a NARS session-index helper that writes `session-index-record.json` from the `session_started` payload.
2. Update the Site-local aggregate on `session_started` and `session_closed` only, with optional coalesced refresh after heartbeat.
3. Keep heartbeat writes per-session and cheap.
4. Add an index reader that falls back from aggregate to per-session records.
5. Add tests for missing/corrupt aggregate rebuild and stale heartbeat classification.
6. Add Narada CLI discovery commands for NARS sessions by Site root and registered Site id.
7. Add no-argument global discovery through known Site roots only; do not scan arbitrary filesystem roots.
8. Add attached projection registration only when a real attach/detach event surface exists.

## Out Of Scope For First Slice

- Renaming physical session directories away from `carrier_...`.
- Removing `NARADA_CARRIER_SESSION_ID`.
- Moving all helper code out of `@narada2/carrier-runtime`.
- Inferring attached clients from process lists or terminal windows.
- Creating a global always-running discovery daemon.
