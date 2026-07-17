# Cloudflare NARS Web Projection

## Purpose

Cloudflare NARS Web Projection is the target shape for making a Cloudflare-hosted operator web UI consume and interact with local NARS sessions without moving runtime authority into Cloudflare.

Local NARS remains the canonical runtime authority for the session, event log, artifact registry, artifact content, queue, turn lifecycle, tool activity, health, and operator input admission. Cloudflare hosts a remote projection embodiment: browser UI, remote access policy, bounded projection cache, event fanout, artifact cache, and input relay.

The public browser-facing input contract is the narrow session-core contract:
`session.submit`, `session.health`, `session.recovery`, `session.cancel`, and
`session.close`. The implementation in `packages/cloudflare-nars-projection`
may retain older `conversation.*` and status verbs internally, but those are
adapter vocabulary only. `agent-web-ui` translates narrow frames at the
Cloudflare boundary; local session-core clients never send the older verbs.

This document governs one concrete instance of the [`Narada Runtime Projection Graph`](narada-runtime-projection-graph.md). The older read-only gateway slice is described in [`nars-remote-projection-gateway.md`](nars-remote-projection-gateway.md). Local session discovery and event-log authority remain in [`nars-session-management.md`](nars-session-management.md) and [`nars-runtime-contract.md`](nars-runtime-contract.md). Operator input semantics remain in [`operator-input-admission.md`](operator-input-admission.md).

## Non-Goals

- Do not make Cloudflare the source of NARS session truth.
- Do not execute tools in Cloudflare for a local NARS session.
- Do not expose raw loopback NARS endpoints directly as the public API.
- Do not treat transport, tunnel, Worker, Durable Object, WebSocket, SSE, or cache mechanics as NARS semantics.
- Do not let a browser token publish canonical-looking NARS events.
- Do not let a bridge credential act as an operator browser credential.
- Do not collapse operator input into raw websocket text or a generalized remote command bus.
- Do not expose local artifact `source_path` values or artifact bytes without projection policy authority.

## Authority Model

The architecture has split authority:

| Concern | Authority |
| --- | --- |
| Local session truth | Local NARS session. |
| Projection intent | Local Narada/NARS record. |
| Remote access state | Cloudflare projection registry/access index. |
| Event ordering and identity | Local NARS event log. |
| Artifact registry and content | Local NARS session artifact registry. |
| Remote cache | Cloudflare projection service, as non-canonical projection state. |
| Operator input admission | Local NARS protocol methods. |
| Browser rendering | Cloudflare-hosted web UI. |

The joining object is a `projection_id`. It connects a local projection intent to Cloudflare remote access state without making either registry pretend to own the other's authority.

## Target Topology

In graph terms, this slice maps local NARS as `authority_runtime`, the local bridge as a `projection_edge`, the Cloudflare projection service as `projection_store`, the Cloudflare-hosted browser UI as `projection_surface`, and browser input relay as an `intent_route` back to local NARS.

```text
local NARS session
  owns session, turns, tools, queue, health, canonical events

local projection bridge process
  attaches to local NARS
  reads events, artifacts, and health
  backfills from the local NARS event log
  backfills allowed artifact metadata/content from the local NARS artifact registry
  connects to Cloudflare using a bridge credential

Cloudflare projection service
  registers projection access state
  authenticates bridge and browser clients
  hosts bounded projection cache
  hosts bounded projected artifact cache
  fans out projected events
  relays admitted operator input envelopes toward the local bridge

Cloudflare-hosted browser UI
  renders the projected session
  submits operator intent through explicit NARS admission verbs
```

Cloudflare is a remote projection host. It is not a second NARS process.

## Cloudflare Workspace Entry

The Cloudflare worker and the local operator workspace have symmetric entry
semantics, but they do not share authority. The Cloudflare root (`/`) and
`/console/` are route-directory landing pages: they show only routes currently
leased to that Cloudflare workspace. They do not redirect into the local Site
Registry and they do not imply that Cloudflare owns site or runtime state.

Cloudflare Console pages are served only when a matching workspace route lease
exists and carries the page's route-directory configuration. An unleased page
returns a typed refusal rather than an HTML shell whose API calls cannot work.
The Site Registry remains a local-authority surface unless a separately leased
remote backend is explicitly supplied. The Cloudflare landing page never
exposes route-directory credentials.

## Live Smoke Lineages

There are two live smoke lineages and they prove different authority shapes:

| Script | Authority runtime | Cloudflare role | What it proves |
| --- | --- | --- | --- |
| `pnpm --filter @narada2/cloudflare-nars-projection smoke:local-origin-live` | Local NARS session. | Remote projection store, hosted browser shell, event/artifact cache, and input relay. | A local authoritative NARS session can be projected to Cloudflare and consumed remotely without moving session authority. |
| `pnpm --filter @narada2/cloudflare-nars-projection smoke:cloudflare-origin-live` | Cloudflare synthetic NARS authority runtime. | Session authority for a synthetic no-provider/no-tools runtime. | Cloudflare can own session identity, event replay, WebSocket live delivery, input admission, health, and revocation for a synthetic NARS authority slice. |

The command names expose the authority-origin axis. Compatibility aliases currently remain: `smoke:live` maps to `smoke:local-origin-live`, and `smoke:authority-live` maps to `smoke:cloudflare-origin-live`. Passing one does not imply the other has passed.

## Cloudflare-Origin Authority Runtime Slice

The first Cloudflare-origin slice is a separate runtime projection graph instance. It does not change the local-origin projection above.

In this slice, Cloudflare is the `authority_runtime` for a synthetic NARS session. The session authority owns session creation, canonical event identity, bounded replay, WebSocket live delivery, health, operator input admission, and revocation. It explicitly does not execute providers or tools.

```text
Cloudflare synthetic NARS authority runtime
  owns session identity, canonical event sequence, health, input admission, revocation
  emits synthetic turn events without provider/tool execution

local operator surface
  attaches to the Cloudflare authority runtime
  replays canonical events
  receives live WebSocket events
  submits operator input through explicit NARS input verbs
```

The first implementation target is intentionally small:

- `POST /api/nars/authority/sessions` creates a Cloudflare-origin synthetic session and emits `session_started`.
- `GET /api/nars/authority/sessions/:session_id/events` replays canonical authority events by sequence cursor.
- `WS /api/nars/authority/sessions/:session_id/events/websocket` attaches a local operator surface to replay and live delivery.
- `POST /api/nars/authority/sessions/:session_id/input` admits operator input and emits synthetic user, turn, assistant, and completion events.
- `GET /api/nars/authority/sessions/:session_id/health` reports authority health for the session.
- `DELETE /api/nars/authority/sessions/:session_id` revokes the session and makes subsequent health, replay, and input calls refuse with `session_revoked`.

The local operator surface attaches with:

```bash
narada-agent-web-ui --cloudflare-authority-session-id <session-id> --cloudflare-api-base-url <projection-host-url>
```

That local surface uses the authority WebSocket endpoint for event delivery and the authority input endpoint for operator input admission.

This slice proves Cloudflare can be an authority runtime in the runtime projection graph without pretending to be a local NARS projection cache and without invoking intelligence providers or MCP tools.

## Cloudflare MCP Fabric

Cloudflare-origin authority sessions use a scoped MCP fabric contract, not one-off hardcoded tool shortcuts. The fabric is the Cloudflare counterpart to local launch MCP scope composition: local launch composes host, user-site, local-site, `none`, and `all` scopes from target-owned MCP configuration; Cloudflare composes Cloudflare-native loci that are meaningful on the hosted authority side.

Cloudflare MCP loci are:

| Locus | Meaning | Default posture |
| --- | --- | --- |
| `cloudflare-host` | Host/platform-wide Cloudflare substrate tools. | Optional; empty until a host-level adapter exists. |
| `cloudflare-account-or-user` | Account/user-level Cloudflare tools, such as future account registries. | Optional; empty until account/user adapters exist. |
| `cloudflare-site` | Site/project authority tools owned by the Cloudflare authority runtime. | Required for the default authority fabric. |
| `session-native` | Session-owned authority tools, such as the session artifact authority adapter. | Required for the default authority fabric. |

Scope values are `none`, one explicit locus, or `all`. `none` produces an empty fabric and must not silently inject any Cloudflare authority adapters. A single-locus scope admits only adapters assigned to that locus. `all` admits every configured locus; optional loci with no adapters remain empty, so the current default `all` effectively yields the required `cloudflare-site` and `session-native` adapters.

Native Cloudflare MCP server descriptors carry:

```json
{
  "locus": "cloudflare-site",
  "adapter_kind": "cf-authority",
  "server_name": "cf-authority",
  "enabled": true,
  "mutation_posture": "read_only_with_diagnostic_fault_probe"
}
```

The initial native adapter kinds are:

| Adapter kind | Default server | Locus | Mutation posture |
| --- | --- | --- | --- |
| `cf-authority` | `cf-authority` | `cloudflare-site` | Read-only context plus diagnostic fault probe. |
| `cf-authority-artifacts` | `cf-authority-artifacts` | `session-native` | Session artifact authority mutation. |

Server names must be unique after scope filtering. Duplicate active server names refuse session creation with `cloudflare_mcp_duplicate_server_conflict`; invalid loci or adapter kinds refuse with `invalid_cloudflare_mcp_adapter_descriptor`. These refusals are configuration failures, not runtime tool failures.

Cloudflare MCP adapters are projections over NARS authority. They do not own independent canonical stores. The `cf-authority-artifacts` adapter mutates the Cloudflare-origin NARS authority artifact registry through the session authority API and emits canonical session artifact events from that authority. Direct HTTP artifact routes remain browser projection routes and are not MCP calls.

The normalized fabric summary is part of session and health diagnostics. It includes requested scope, requested/effective loci, required/optional loci, server count, server names, and the normalized server descriptors. Operator surfaces should use that summary to distinguish no MCPs, configured MCPs, and fabric misconfiguration.

### Deployed Authority Runtime Smoke

The deployed Cloudflare-origin authority path has an explicit live smoke command:

```bash
pnpm --filter @narada2/cloudflare-nars-projection smoke:cloudflare-origin-live -- --live --cloudflare-api-base-url https://narada-nars-projection.andrei-kokoev.workers.dev
```

Running the command without `--live` is a safe planning mode. It does not mutate Cloudflare state and prints the command shape required for a live run.

By default, the smoke is operator-readable. It prints each phase while it works, then summarizes the authority origin, authority runtime kind, Worker URL, synthetic session id, hosted web UI URL, WebSocket endpoint, check statuses, cleanup status, evidence path, latest evidence path, and evidence index path. For machine-readable output, pass `--format json`; the full evidence object is also written to disk.

The smoke creates one synthetic Cloudflare-origin NARS authority session, checks service and session health, checks bounded replay, opens the authority WebSocket, admits one `session.submit` input, observes synthetic user/assistant/turn completion events, checks the hosted web UI shell, revokes the session, and verifies post-revoke refusal for health, replay, and input.

Current evidence boundary:

1. The service endpoint is deployed and can report projection service health.
2. The Cloudflare authority runtime can create a synthetic session and emit canonical replayable events.
3. The authority WebSocket can deliver replay plus live synthetic turn events to a non-browser observer.
4. The authority input endpoint can admit an operator `session.submit` envelope and emit the expected synthetic user, assistant, and completion events.
5. Session revocation makes direct health, replay, and input APIs refuse with `session_revoked`.
6. Hosted web UI evidence is compositional. `hosted_shell_check_kind: http_html_shell_only` proves only that the deployed Worker returns the web UI document for an authority-session URL. `hosted_web_ui_evidence.levels[]` records the ordered proof levels, and `strongest_hosted_web_ui_evidence: browser_level_authority_e2e` is the browser-level proof: it opens the deployed web UI in a real browser, verifies JavaScript boot and authority URL configuration, renders replay and live WebSocket events, submits operator input through the composer, renders the synthetic assistant response and turn completion without duplicate user/assistant messages, revokes the session, and verifies the UI reports revoked/disconnected state.

Resolution item #4 is the browser-level hosted web UI proof. It is resolved only when the deployed `smoke:cloudflare-origin-live` evidence includes `hosted_browser.status: passed`, `strongest_hosted_web_ui_evidence: browser_level_authority_e2e`, and the browser-level `hosted_web_ui_evidence.levels[]` all pass. Shell-only evidence is still retained as a fast availability check but is not sufficient for #4.

Evidence artifacts are append-only plus indexed. Each live run writes a timestamped evidence file, a stable `*-latest.json` copy, and a stable `*-index.json` pointer with latest status and strongest hosted web UI evidence. The latest/index files are operator ergonomics; the timestamped evidence remains the audit artifact.

Evidence Status:

| Field | Value |
| --- | --- |
| Status | Browser-level deployed authority E2E passed. |
| Last verified command | `pnpm --filter @narada2/cloudflare-nars-projection smoke:cloudflare-origin-live -- --live --cloudflare-api-base-url https://narada-nars-projection.andrei-kokoev.workers.dev` |
| Strongest evidence | `browser_level_authority_e2e` |
| Evidence fields | `hosted_web_ui_evidence.levels[]`, `strongest_hosted_web_ui_evidence`, `evidence_path`, `evidence_latest_path`, `evidence_index_path` |
| Known gaps | Cloudflare-origin authority remains synthetic/no-provider/no-tools; provider/tool-capable Cloudflare authority is a separate design decision. |

The next goal after resolution of #4 is to decide whether Cloudflare-origin authority remains a synthetic/no-provider runtime slice or grows into a real provider/tool-capable authority runtime. That is a separate authority-design decision, not part of the browser-level proof.

If the smoke fails after creating a synthetic session, it performs a best-effort cleanup revoke before writing evidence. A successful run leaves the synthetic session revoked.

## Projection Instance

A projection instance is the central object:

```json
{
  "projection_id": "proj_...",
  "site_id": "narada.sonar",
  "nars_session_id": "carrier_...",
  "local_bridge_id": "bridge_...",
  "target": "cloudflare",
  "event_stream_policy": "operations",
  "artifact_projection_policy": {
    "metadata": "public_records",
    "content": "selected_kinds",
    "allowed_kinds": ["markdown", "json", "text"],
    "max_content_bytes": 1048576,
    "html": "metadata_only"
  },
  "operator_input_policy": [
    "conversation.send",
    "conversation.enqueue",
    "conversation.steer",
    "conversation.interrupt",
    "session.close"
  ],
  "replica_cache_policy": "short_bounded",
  "created_by": "operator",
  "created_at": "2026-06-30T00:00:00.000Z",
  "expires_at": null,
  "revoked_at": null
}
```

The first target binds one projection instance to one concrete NARS session. A higher-level site or agent selector may help discover the active session, but the projection itself must resolve to a specific `nars_session_id`.

`operator_input_policy` is the Cloudflare adapter wire policy stored on the
remote access record. The browser-facing contract remains the narrow
session-core set: `session.submit`, `session.cancel`, and `session.close` for
downward control, with health and recovery read through their dedicated
projection endpoints. `agent-web-ui` translates the narrow frames to the
adapter methods listed by this policy. The policy must include
`conversation.interrupt` and `session.close` when the browser is expected to
support `/interrupt` and `/exit`.

## Registry Split

Projection registry is split-authority:

1. Local Narada/NARS owns projection intent: this local site/session should be projected to this target embodiment.
2. Cloudflare owns remote access state: these bridge credentials and browser tokens are valid for this projection under this policy.
3. `projection_id` joins the two records.

Local intent can exist before Cloudflare is reachable. Cloudflare access can be revoked without mutating the local NARS session.

## Credentials

Credential authority is split:

| Credential | Holder | Permitted use |
| --- | --- | --- |
| Bridge credential | Local bridge process | Publish projected events and policy-admitted artifact metadata/content for `projection_id`; receive downward input envelopes for local NARS. |
| Browser access token | Browser/operator client | Subscribe to allowed projection views, read policy-admitted artifacts, and submit policy-admitted operator input verbs. |

The bridge credential must not work as a browser token. A browser token must not publish events or impersonate the local bridge.

Artifact read authority is a separate browser-token capability. A token allowed to read conversation events is not implicitly allowed to read projected artifact content.

Credential minting is two-phase:

1. Local Narada records projection intent and requests Cloudflare registration.
2. Cloudflare registers the projection in its remote access index and mints remote credentials bound to `projection_id`.
3. Local Narada stores the returned remote registration metadata needed to launch the bridge.

## Event Flow

Events flow upward from local NARS to Cloudflare through the local bridge:

```text
local NARS events.jsonl / live stream
  -> local bridge projection/filter/redaction
  -> Cloudflare projection service
  -> projection cache and browser subscribers
```

Required event invariants:

- NARS mints event identity and sequence.
- Cloudflare preserves `site_id`, `nars_session_id`, `projection_id`, `event_sequence`, `event_id`, schema, and timestamp where present.
- Cloudflare may cache projected events, but cache disagreement with local NARS resolves in favor of local NARS.
- Browser reconnect uses cursor/sequence semantics and tolerates idempotent replay.

## Remote Live Transport

The remote browser projection is WebSocket-first for live event delivery.

The steady-state transport split is:

| Route | Role |
| --- | --- |
| `GET /api/nars/projections/:projection_id/events` | Bounded replay, refresh, cursor recovery, and diagnostics. |
| `WS /api/nars/projections/:projection_id/events/websocket` | Live browser subscription and push fanout from the Cloudflare Durable Object. |
| `POST /api/nars/projections/:projection_id/events` | Bridge publication of projected local NARS events into Cloudflare. |
| `POST /api/nars/projections/:projection_id/input` | Browser operator input relay toward the local bridge and local NARS admission. |

The browser may perform one HTTP replay read before opening the WebSocket. That replay is not the live delivery mechanism and must not be described as long polling. After bootstrap, newly published events should arrive by WebSocket push from the Durable Object subscriber set.

SSE may remain as a compatibility or diagnostic route, but it is not the authoritative browser live path for this projection. Live deployed behavior, not local plausibility, decides the supported operator path.

This separation prevents three failure modes:

- remote UI appearing healthy while only showing stale replayed events;
- hidden browser polling that masks missing fanout;
- unit tests specifying an unused transport while the deployed path uses another one.

## Artifact Registry And Content Flow

Artifacts are a separate projection lane, not just another chat event payload. Local NARS owns the artifact registry, artifact lifecycle, source-to-public metadata mapping, content serving, content type, and sandbox policy. Cloudflare may cache projected artifact metadata and selected content, but it never becomes artifact authority.

```text
local NARS artifacts/index.json and artifact content
  -> local bridge artifact policy/filter/redaction
  -> Cloudflare projected artifact metadata/content cache
  -> browser artifact API and renderer
```

The local bridge should replicate artifacts as part of the same projection bridge process that handles events and input relay. Artifact replication is a lane of the bridge, not a separate unrelated daemon and not agent-web-ui responsibility. Splitting it into a second process is warranted only if artifact transfer becomes operationally heavy enough to need independent lifecycle, retry, or resource budgets.

Artifact projection has two distinct products:

| Product | Default posture | Reason |
| --- | --- | --- |
| Public artifact metadata | Allowed when artifact policy admits metadata. | Metadata is already the public record form and omits local source paths. |
| Artifact content bytes | Opt-in by policy. | Content can be large, sensitive, active HTML, or unsuitable for remote cache. |

The projection policy must distinguish metadata from content. A browser token that can read conversation events does not automatically gain artifact content access.

Recommended artifact policy shape:

```json
{
  "artifact_projection_policy": {
    "metadata": "public_records",
    "content": "selected_kinds",
    "allowed_kinds": ["markdown", "json", "text"],
    "max_content_bytes": 1048576,
    "html": {
      "mode": "metadata_only",
      "sandbox": "nars_default_strict"
    },
    "image": {
      "mode": "metadata_only"
    },
    "cache_ttl_seconds": 3600,
    "redact_local_paths": true
  }
}
```

The policy vocabulary should admit these content modes:

- `none`: do not project content bytes.
- `metadata_only`: project only public artifact records.
- `selected_kinds`: project content only for explicitly allowed artifact kinds and byte limits.
- `explicit_artifacts`: project content only for artifact ids explicitly admitted by policy or operator action.

Artifact projection invariants:

- NARS artifact ids, lifecycle state, content type, render hints, and sandbox posture are preserved.
- Local `source_path` is never projected to Cloudflare or browser clients.
- Inactive artifacts are refused unless a diagnostic policy explicitly admits historical metadata.
- HTML content is metadata-only by default; content projection requires explicit policy and must preserve or strengthen the NARS sandbox posture.
- Cloudflare cache entries are invalidated or refused when projection, credential, artifact lifecycle, or artifact policy no longer admits them.
- Browser artifact reads are authorized separately from event reads.

Artifact backfill source is local NARS artifact registry and content. Cloudflare cache may serve browser refreshes, but local NARS resolves disagreement.

## Backfill And Cache

The default cache policy is a short bounded Cloudflare projection cache. It supports browser refresh, reconnect, and short bridge gaps.

Backfill source is local NARS:

```text
last_replicated_sequence = 120
bridge reconnects
bridge reads local NARS events from 121
bridge pushes missing projected events to Cloudflare
```

Durable cloud archive is allowed only as an explicit switchable projection mode. It is not implied by enabling the web projection.

## Operator Input Flow

Downward operator input uses the explicit NARS admission method:

```text
session.submit
```

The browser constructs a `session.submit` envelope. The Cloudflare transport
translates it to `conversation.send` or `conversation.enqueue` on the remote
input endpoint, according to `delivery_mode`; `session.cancel` becomes
`conversation.interrupt`, and `session.close` remains `session.close`. Cloudflare
validates browser access and the adapter policy, then relays the admitted frame
to the local bridge. Local NARS either admits or refuses the narrow frame
through the same protocol surface used by local clients.

The semantic acknowledgement point is NARS admission, not Cloudflare receipt and not bridge receipt. A remote UI may display intermediate states, but the point where the message becomes session-owned is the NARS acknowledgement.

Recommended visible states:

```text
sending -> delivered_to_projection -> delivered_to_bridge -> admitted_by_nars -> processed
```

`session.submit` with `delivery_mode: admit_after_active_turn` is non-interrupting
and NARS-owned after acknowledgement. Cancellation is a separate
`session.cancel` control.

## Event Filtering Policy

Replication is policy-driven by event class, not by UI tab names.

A projection policy may admit:

- conversation messages;
- operator input lifecycle;
- turn lifecycle;
- safe tool call summaries;
- queue/admission state;
- projection health;
- public artifact metadata;
- selected artifact content under artifact policy;
- selected diagnostics.

A projection policy should suppress or redact by default:

- secrets and credential material;
- raw tool payloads;
- high-volume health heartbeats;
- local absolute paths unless policy explicitly admits them;
- raw provider traces unless diagnostics authority admits them;
- raw artifact `source_path` values.

Useful projection modes may be named `conversation`, `operator`, `diagnostic`, and `raw`, but implementation should classify source events by event class and policy, not by rendered view names.

## Runtime Attach And Detach

Cloudflare projection is runtime-switchable as an attachment to a running NARS session.

Coherent operations include:

```text
projection enable cloudflare
projection disable cloudflare
projection status
projection replay --from-sequence <n>
projection artifacts sync
projection artifacts status
```

Enabling projection attaches a bridge/projection sink and optionally backfills. Disabling projection stops remote replication and emits local evidence, but does not change local NARS identity or session state. Artifact sync/status operations are bridge-lane operations: they may change remote projected cache state, but they must not mutate local artifact authority except through explicit NARS artifact APIs.

## Failure Modes

Cloudflare unavailability must not fail local NARS launch. The local runtime continues. The bridge reports degraded state and retries according to policy.

| Failure | Expected posture |
| --- | --- |
| Cloudflare registration unavailable | Local projection intent remains local; bridge/projection reports unavailable. |
| Bridge disconnected | Local NARS continues; Cloudflare projection becomes stale/disconnected. |
| Browser disconnected | Projection continues; browser resumes by cursor when possible. |
| Cache truncated | Browser may lose remote scrollback; local NARS remains authoritative for backfill. |
| Artifact cache truncated | Browser may lose remote artifact content; local NARS artifact registry/content remains authoritative. |
| Artifact content refused by policy | Browser receives typed refusal; event and metadata projection may continue. |
| Artifact content missing locally | Artifact content read refuses; Cloudflare cache must not claim canonical availability. |
| Browser token revoked | Browser loses access; bridge and local NARS continue. |
| Bridge credential revoked | Bridge cannot publish/relay; browser projection becomes stale. |
| Projection revoked | Bridge credential, browser tokens, cache serving, and input relay become invalid for `projection_id`. |

## Revocation

Projection instance revocation is the primary lifecycle action. Revoking a projection invalidates bridge credential, browser access tokens, cache serving, and downward input relay for that projection.

Targeted credential revocation remains useful:

- revoke one browser token when one remote client is compromised;
- rotate/revoke bridge credential when the local bridge credential is compromised;
- revoke projection instance when the whole remote embodiment should stop.

Credentials are valid only when both the credential and its projection instance are valid and policy admits the requested action.

## Deployment Shape

The first implementation target is Cloudflare Worker plus static app:

- Worker validates browser tokens and bridge credentials.
- Worker exposes projection registration/access endpoints.
- Worker serves event subscription, artifact metadata/content, and operator input relay routes.
- Static app renders the operator projection.

Durable Objects are the Cloudflare-side coordination point for per-projection state, WebSocket subscriber fanout, cursor-aware replay, and stronger server-side cache coordination. They remain projection infrastructure, not NARS authority.

## Manual Live Smoke Path

Automated tests should use local/fake projection services and must not require live Cloudflare credentials. A live Cloudflare smoke, when intentionally run by an operator, should use the same two-phase shape. The operator procedure and evidence contract are maintained in [`../product/cloudflare-nars-web-projection-live-smoke.md`](../product/cloudflare-nars-web-projection-live-smoke.md).

1. Build the browser shell and Worker package:

   ```text
   pnpm --filter @narada2/agent-web-ui build
   pnpm --filter @narada2/cloudflare-nars-projection build
   ```

2. Deploy or preview the Cloudflare projection Worker from `packages/cloudflare-nars-projection`. Its `wrangler.toml` serves `../agent-web-ui/dist` through the Worker assets binding and keeps projection APIs under `/api/nars/projections/...`.
3. Start or identify a concrete local NARS session for the target Site and agent.
4. Register a projection intent and remote access record:

   ```text
   narada nars projection register --site-id <site-id> --site-root <site-root> --session <nars-session-id> --projection-id <projection-id> --cloudflare-api-base-url https://<projection-host> --preflight-only --no-dry-run
   narada nars projection register --site-id <site-id> --site-root <site-root> --session <nars-session-id> --projection-id <projection-id> --cloudflare-api-base-url https://<projection-host> --no-dry-run
   ```

   When the registration should also prove the current Cloudflare operator identity, pass `--cloudflare-carrier-url <carrier-url> --operator-cookie-file <cookie-file> --require-operator-session`. A 401 from cookie-backed `site.read` is a stale operator session, not a projection registration failure; refresh it with `pnpm cloudflare:operator:login` and rerun the preflight.

5. Start the separate local bridge process from the returned command, normally:

   ```text
   narada nars projection bridge-start --site-root <site-root> --projection-id <projection-id>
   ```

6. Open the web projection client with query configuration:

   ```text
   https://<projection-host>/?cloudflare_projection_id=<projection-id>&cloudflare_api_base_url=https://<projection-host>
   ```

7. Verify upward event replay, WebSocket live delivery, artifact metadata projection, a policy-admitted artifact read when configured, a policy-admitted operator input verb, and revocation/refusal behavior.

   The bounded opt-in script is:

   ```text
   pnpm --filter @narada2/cloudflare-nars-projection build:assets
   pnpm --filter @narada2/cloudflare-nars-projection smoke:local-origin-live -- --cloudflare-api-base-url https://<projection-host> --site-root <site-root> --site-id <site-id> --session <nars-session-id>
   pnpm --filter @narada2/cloudflare-nars-projection smoke:local-origin-live -- --live --cloudflare-api-base-url https://<projection-host> --site-root <site-root> --site-id <site-id> --session <nars-session-id> --expected-assets-manifest packages/cloudflare-nars-projection/public/narada-cloudflare-assets.json --evidence-path <path>
   ```

   Without `--live`, the smoke prints the required live arguments and performs no mutation. With `--live`, it also compares the deployed `narada.cloudflare_assets_manifest.v1` against the local build manifest, then writes a concise evidence JSON covering registration, bridge replay, deployed hosted browser attachment, Cloudflare WebSocket projection, artifact metadata/content read when available, one operator input relay, local NARS admission, bridge replication back to Cloudflare, revocation, and post-revocation refusal.

If Cloudflare registration or bridge connectivity is unavailable, the expected result is a typed degraded/local-only projection status. Local NARS launch and local session health must remain successful.

## Relationship To Other NARS Documents

- [`nars-session-management.md`](nars-session-management.md) owns local NARS session discovery and local event-log authority.
- [`nars-runtime-contract.md`](nars-runtime-contract.md) owns the NARS protocol and event subscription contract.
- [`operator-input-admission.md`](operator-input-admission.md) owns `send`, `enqueue`, and `steer` semantics.
- [`nars-remote-projection-gateway.md`](nars-remote-projection-gateway.md) describes a narrower gateway/read-only slice and should be interpreted under this Cloudflare projection target.
- `packages/nars-session-core/src/artifacts.mjs` is the current implementation authority for local NARS artifact registry records; `packages/agent-runtime-server/src/server-wrapper.mjs` owns session-scoped artifact request handling.

## Locked Decisions

1. Projection registry is split: local projection intent plus Cloudflare remote access index.
2. Projection instance lifetime is per concrete NARS session.
3. Replica cache is short bounded by default; durable archive is explicit switchable mode.
4. Downward input uses `session.submit` (with optional `delivery_mode: admit_after_active_turn`), policy-gated.
5. Bridge credential and browser access token are separate.
6. Credential minting is two-phase registration.
7. Bridge is a separate local process.
8. Backfill source is the local NARS event log; Cloudflare cache may optimize.
9. Deployment is Worker plus static app first; Durable Object later when needed.
10. Revocation is anchored on projection instance lifecycle, with targeted credential actions available.
11. Cloudflare unavailable means warn and continue local-only; bridge retries in background.
12. Event filtering is policy-driven by event class.
13. Artifact registry and artifact content projection are separate policy lanes from event projection.
14. Artifact replication belongs to the same local projection bridge process by default, as an artifact lane.
15. Artifact metadata may be projected as public records; artifact content is opt-in and config-rich.
16. Cloudflare artifact cache is non-canonical; local NARS artifact registry/content remains authority.
17. Remote browser live delivery is WebSocket-first; HTTP event reads are replay/recovery, not polling.
18. Completion evidence for deployed projection must prove semantic round trip through deployed Cloudflare, hosted browser UI, bridge, live local NARS admission, replication back, and revocation/refusal.
