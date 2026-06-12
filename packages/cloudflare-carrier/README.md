# Cloudflare Carrier

Cloudflare-hosted Narada carrier implementation backed by a Worker and one Durable Object per carrier session.

The implementation preserves the shared carrier runtime contract while making Cloudflare-specific host choices for routing, storage, authentication, provider execution, and the first tool/effect boundary.

See [`docs/architecture/cloudflare-carrier/target.md`](../../docs/architecture/cloudflare-carrier/target.md) for the architecture target.

## Public Surface

Package exports:

- `@narada2/cloudflare-carrier` exports the session/router runtime core.
- `@narada2/cloudflare-carrier/worker` exports the Worker, Durable Object class, auth helper, Workers AI provider adapter, Cloudflare tool/effect adapter, and tool/effect admission classifier.

Important Worker exports:

- `CloudflareCarrierDurableObject`
- `authenticateCarrierRequest`
- `createCloudflareAiProviderAdapter`
- `createCloudflareToolEffectAdapter`
- `classifyCloudflareToolEffectAdmission`

## Worker Product Surface

The deployed Worker serves a minimal authenticated operator console at:

- `GET /`
- `GET /console`

The console is intentionally Worker-native HTML and browser JavaScript, so no separate asset build or static hosting step is required. It lets an operator sign in with Microsoft, optionally provide an automation bearer token, start or resume a carrier session, send carrier input, read session events, inspect provider/tool/effect evidence from event payloads, read the Site product model, govern Site membership, view or create Cloudflare-backed Narada tasks, and review repository publication requests, returned evidence, Cloudflare GitHub executions, and provider liveness.

Browser and API clients can call the carrier JSON API at:

- `POST /api/carrier`

The existing compatibility routes remain available:

- `POST /`
- `POST /control`

All JSON API routes require either bearer auth or a valid operator session cookie and accept the same operation envelope, including `session.start`, `session.status`, `carrier.input.deliver`, `carrier.command.execute`, `carrier.interrupt`, `session.events.read`, `session.close`, and Site product operations such as `site.read` and `site.membership.put`.

`site.read`, `site.list`, and `operation.read` expose product status derived from durable Site registry records, D1 task state, continuity packets, and carrier session event replay. Mutating carrier requests mirror appended session events into a Site Registry D1 evidence index when that binding is available, so product reads can replay evidence without directly touching each Durable Object. The `carrier_evidence_read_status` field makes replay posture explicit: `loaded` means all listed sessions were read from the D1 index or Durable Object event snapshots, `degraded` means at least one listed session could not be replayed, and `no_sessions` means there was no session evidence to read.

## Tool / Effect Boundary

Provider tool-call output is not effect execution.

When a provider emits a tool call, the carrier records the boundary crossing through session events:

1. `provider_tool_call_requested`
2. `tool_call_requested`
3. `tool_result_received`

Default posture is deny-by-default. Without a configured tool/effect adapter, tool results are recorded as:

```json
{
  "status": "denied",
  "result_summary": "tool_effect_adapter_unconfigured"
}
```

The configured Cloudflare adapter admits only explicitly enabled capabilities. Set `CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS=1` to admit:

- `cloudflare_carrier_runtime_metadata_read`

Set `CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS=1` and provide a `CLOUDFLARE_CARRIER_KV` or `NARADA_CARRIER_KV` binding to admit:

- `cloudflare_carrier_kv_get`

Set `CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES=1` and provide a KV binding with `put()` to admit:

- `cloudflare_carrier_kv_put`

Set `CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS=1` and provide a D1 binding named `CLOUDFLARE_CARRIER_TASK_DB` or `NARADA_TASK_DB` to admit Cloudflare D1-backed Narada task effects:

- `cloudflare_carrier_task_create`
- `cloudflare_carrier_task_update`
- `cloudflare_carrier_task_list`

Task tools store task lifecycle state in Cloudflare D1, scoped by `site_id`, outside the Durable Object session snapshot. The `/task create <title>` and `/task update <task-id> <status> [note]` commands trigger the same admitted task effect boundary as provider tool calls, and `session.status` reads the current D1-backed `tasks` model for console rendering and persisted readback.

Unsupported tools remain denied with `unsupported_tool_effect`; the requested tool name remains visible in the tool result payload. Tool results also carry structured `admission_action` and `admission_reason` fields when the boundary admits or denies the effect. Admitted runtime metadata, KV, and task effects carry `capability_ref`, `effect_scope`, and `authority_ref` evidence. If a principal lacks matching `controlled_actions`, the carrier records `tool_effect_authority_denied`.

`session.status` exposes the current posture:

- `tool_effect_posture`
- `tool_effect_adapter_kind`
- `tool_effect_supported_tools`
- `tool_effect_capabilities`

These fields are evidence of adapter posture. Capability records describe the effects an adapter may admit; they are not grants to arbitrary provider output.

## Provider Boundary

Workers AI is available through `createCloudflareAiProviderAdapter` when the Worker environment provides `env.AI.run`.

Default model:

- `@cf/meta/llama-3.1-8b-instruct`

Environment overrides:

- `CLOUDFLARE_CARRIER_AI_MODEL` or `AI_MODEL`
- `CLOUDFLARE_CARRIER_AI_TIMEOUT_MS`
- `CLOUDFLARE_CARRIER_AI_MAX_RETRIES`

Provider execution records provider request/output/turn evidence. The first Workers AI request advertises only configured carrier-owned tools; when the model emits a tool call, the carrier records the boundary result and sends that result evidence through bounded follow-up provider turns. Workers AI support does not grant effects outside the configured tool/effect adapter.

## Auth Boundary

The Worker requires authenticated caller evidence before routing to the Durable Object or Site product API.

Automation callers may use bearer auth through these secret bindings:

- `ADMIN_BEARER_TOKEN` or `CLOUDFLARE_CARRIER_ADMIN_TOKEN`
- `SERVICE_TOKEN` or `CLOUDFLARE_CARRIER_SERVICE_TOKEN`

Browser operators may use Microsoft OIDC through Worker-owned auth routes:

- `GET /auth/microsoft/login`
- `GET /auth/microsoft/callback`
- `GET /auth/session`
- `POST /auth/logout`

Required Microsoft/operator session configuration:

- `MICROSOFT_OIDC_TENANT_ID`
- `MICROSOFT_OIDC_CLIENT_ID`
- `MICROSOFT_OIDC_CLIENT_SECRET`
- `MICROSOFT_OIDC_REDIRECT_URI`
- `NARADA_OPERATOR_SESSION_SECRET`

The Microsoft app registration should use the Web platform redirect URI:

```text
https://<worker-host>/auth/microsoft/callback
```

The Worker uses authorization code flow with PKCE, validates Microsoft ID tokens, and then creates a D1-backed Narada operator session in `CLOUDFLARE_SITE_REGISTRY_DB`. Operator sessions use a signed `HttpOnly; Secure; SameSite=Lax` cookie named `narada_operator_session`.

For local live probes that must use the Microsoft operator principal rather than a service token, capture a loopback-scoped operator session cookie:

```powershell
pnpm --filter @narada2/cloudflare-carrier operator-session:capture -- --url https://<worker-host> --out D:\tmp\narada-cloudflare-operator-session.json
```

The command prints a Microsoft login URL, listens only on a loopback HTTP callback, writes the signed operator-session cookie to the output JSON, and verifies `/auth/session` resolves to `auth_type: microsoft_oidc`. The capture endpoint refuses non-loopback `return_to` URLs.

Microsoft identity is not Site authority. The Worker maps Microsoft claims into a Narada principal:

```text
microsoft:<tenant_id>:<object_id>
```

Site Registry membership remains the authority source for `site.read`, carrier session binding, and Site-scoped effects. OAuth token values are never serialized into carrier evidence.

Owners and maintainers may govern Site membership through `site.membership.put`. The operation validates role/status, upserts the target `principal_id`, and records `site_membership_updated` authority evidence. This replaces manual D1 membership edits for Microsoft operator admission.

Auth identifies the caller and records principal evidence. It does not by itself authorize arbitrary effects.

## Scripts

Run local contract tests:

```powershell
pnpm --filter @narada2/cloudflare-carrier test
```

Run deploy checks without live deployment:

```powershell
pnpm --filter @narada2/cloudflare-carrier deploy:check
```

Run the package ship gate:

```powershell
pnpm --filter @narada2/cloudflare-carrier ship
```

`ship` runs tests, deploy checks, and Wrangler dry-run bundling.

Materialize or validate the local Site continuity binding registry:

```powershell
pnpm --filter @narada2/cloudflare-carrier continuity:bindings
pnpm --filter @narada2/cloudflare-carrier continuity:bindings:validate
pnpm --filter @narada2/cloudflare-carrier continuity:bindings:list
pnpm --filter @narada2/cloudflare-carrier continuity:bindings:prepare-next
pnpm --filter @narada2/cloudflare-carrier continuity:bindings:admit-next -- --local-site-ref file:///D:/code/narada --cloudflare-site-ref cloudflare://<site-ref> --execute
```

`continuity:bindings` reads packet `binding` evidence and writes `.narada/site-continuity/bindings.json`. It accepts `NARADA_SITE_CONTINUITY_PACKET` or repeated `--packet` for explicit packet files, and `NARADA_SITE_CONTINUITY_PACKET_DIR` or `--packet-dir` for multi-site packet directories containing `<file-safe-site-id>-packet.json` files.

`continuity:bindings:prepare-next` reads the last scheduled health snapshot and prepares a standard Site continuity exchange packet when the snapshot's next operator action is `bind_cloudflare_product_next_site_locally`. It refuses to invent missing authority refs; provide `--local-site-ref` and `--cloudflare-site-ref` when the target site is not already projected with an explicit Cloudflare site ref. The prepared packet carries no executable mutation requests and can then be materialized with `continuity:bindings -- --packet <prepared-packet-path>`.

`continuity:bindings:admit-next` is the direct operator admission path for that same next-site action. It reads the last scheduled health snapshot, requires explicit `file://` local and `cloudflare://` Cloudflare refs, refuses projection conflicts, preserves existing local continuity bindings, and only writes `.narada/site-continuity/bindings.json` when `--execute` is present.

Run one guarded local-cloud continuity loop:

```powershell
pnpm --filter @narada2/cloudflare-carrier continuity:run-once
```

`continuity:run-once` is the product-facing alias for the existing live reconciliation execution path: it plans ready configured sites, runs guarded `sync-once`, writes the reconciliation execution artifact, and records that execution evidence back to Cloudflare. The underlying continuity transport now accepts either bearer-token auth or captured Microsoft operator-session auth, so a direct operator run no longer has to fall back to service-token posture. Use `NARADA_SITE_CONTINUITY_PACKET` for a single configured site. Use `NARADA_SITE_CONTINUITY_PACKET_DIR` for multiple configured sites; each site packet is resolved as `<file-safe-site-id>-packet.json` from that directory.

Read local-cloud continuity health, including local sync artifacts, last reconciliation execution, and live Windows Task Scheduler readback:

```powershell
pnpm --filter @narada2/cloudflare-carrier continuity:health
```

`continuity:health` loads the same local `.env` and `.narada/site-continuity/cloudflare-continuity.env` configuration as the scheduled-task wrapper, then attaches bounded Task Scheduler query evidence to the status output. It reports the installed task state, last result, next run, whether Task Scheduler points at the hidden `wscript.exe //B` wrapper, whether that wrapper file matches the package plan, and whether the host scheduler cadence matches the package plan.

Read the provider-liveness scheduler posture with the same operator-facing text style:

```powershell
pnpm --filter @narada2/cloudflare-carrier provider-liveness:status:live:text
```

`provider-liveness:status:live:text` performs a bounded live Task Scheduler readback for `\Narada\CloudflareProviderLivenessRefresh`. It reports whether Task Scheduler points at the hidden `wscript.exe //B` wrapper, whether the wrapper file matches the package plan, whether the two-minute cadence matches, the last run result, the next run time, and any attention reasons without exposing credential values.

Read the last durable scheduled health snapshot without querying Cloudflare or Task Scheduler:

```powershell
pnpm --filter @narada2/cloudflare-carrier continuity:health:last
```

`continuity:health:last` reads `.narada/site-continuity/health/cloudflare-continuity-health-last.json`, the snapshot written by the scheduled continuity loop. It is distinct from `continuity:last`, which reads the last sync artifact. When the scheduled loop has Cloudflare carrier URL and auth available, the snapshot also includes compact `site.list` product posture evidence under `cloudflare_product_posture`, local binding coverage for the remote next site under `cloudflare_product_binding_alignment`, and `operation.list` posture for the next selected site under `cloudflare_operation_posture`, without embedding credential values. The readback summary also projects `operator_next_action`, `operator_next_target_site_id`, `operator_next_reason`, and `operator_next_source`; an unbound remote next site becomes `bind_cloudflare_product_next_site_locally` so the attention state names its next operator move.

Scheduled health also reports `cloudflare_product_binding_preparation`, which says whether the next local binding packet can be prepared from current evidence or is blocked by missing explicit `local_site_ref` / `cloudflare_site_ref` inputs.

Run a bounded live continuity health readback with direct operator-session auth, without relying on token-only env configuration:

```powershell
pnpm --filter @narada2/cloudflare-carrier continuity:health:text -- --operator-session-file cloudflare-operator-session.json
```

`continuity:health:text` now accepts the same `--token`, `--token-file`, `--operator-session-cookie`, and `--operator-session-file` auth inputs as the other Cloudflare product read surfaces. In live mode it performs the Task Scheduler readback, summarizes local continuity health, and attaches live `site.list` / `operation.list` Cloudflare posture with non-secret auth provenance, local binding alignment, and binding preparation state, without echoing bearer tokens or operator-session cookies.

Install the Windows scheduled task for the recurring continuity loop after the site and packet path are configured in the local continuity env file:

```powershell
pnpm --filter @narada2/cloudflare-carrier continuity:install
```

`continuity:install` creates or replaces the local Windows Task Scheduler entry with the same scheduled-task wrapper used by `continuity:run-once`; the task command carries no credential values and no long per-site argument payload. For unattended Windows scheduling, keep non-secret continuity inputs such as `NARADA_SITE_CONTINUITY_PACKET`, `NARADA_SITE_CONTINUITY_PACKET_DIR`, and `NARADA_SITE_CONTINUITY_SITES` in `.narada/site-continuity/cloudflare-continuity.env`, while Cloudflare credentials stay in the local root `.env` token-file pointer.

## Deploy Check Coverage

`deploy:check` verifies:

- Wrangler config shape;
- Durable Object binding;
- D1 task database binding;
- Workers AI binding;
- auth and principal evidence;
- Microsoft operator identity console hooks;
- governed Site membership update surface;
- Durable Object routing and snapshot reload;
- tool/effect admission classifier behavior;
- deny-by-default tool/effect result evidence;
- configured tool/effect admission for `cloudflare_carrier_runtime_metadata_read`, `cloudflare_carrier_kv_get`, and `cloudflare_carrier_kv_put`;
- configured task effect admission for `cloudflare_carrier_task_create`, `cloudflare_carrier_task_update`, and D1-backed `session.status` task readback;
- configured KV write execution failure after admission, proving admitted `failed` result evidence is distinct from boundary denial;
- thrown tool-effect adapter failures, proving pre-admission boundary execution failures are still recorded as `tool_result_received` with `status: failed`.

## Product Readback

Use `product:read` for read-only inspection of the deployed Cloudflare carrier product model. It calls the same `POST /api/carrier` operation envelope as the browser console and accepts either the automation bearer token or a captured Microsoft operator session cookie.

```powershell
pnpm --filter @narada2/cloudflare-carrier product:site:list -- --url <worker-url> --token <token>
pnpm --filter @narada2/cloudflare-carrier product:site:read -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:site-continuity:publish -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:site-continuity:loop-report -- --url <worker-url> --site <site-id> --report-file .narada/site-continuity/<site-id>-cloudflare-sync.json --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:list -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json --format summary
pnpm --filter @narada2/cloudflare-carrier product:operation:read -- --url <worker-url> --site <site-id> --operation-id <operation-id> --format summary
```

The command prints a `narada.cloudflare_carrier.product_read.v1` envelope by default, including `site.list`, `site.read`, `operation.list`, or `operation.read` response evidence and a compact summary. It records only `auth_source` in the output; bearer tokens and operator-session cookies are not echoed.

Use `product:site-continuity:publish` when a site product read or workflow route names `publish_cloudflare_continuity_packet` as the next action. It calls `site.continuity.packet.publish` through the same authenticated `POST /api/carrier` envelope, records only the Cloudflare-side continuity packet import, and returns the packet direction, packet admission, and packet durability action without inventing filesystem or repository mutation authority.

Use `product:site-continuity:loop-report` when the next step is to refresh Cloudflare-side loop evidence after a local continuity sync. It calls `site.continuity.loop.report.put` through the same authenticated `POST /api/carrier` envelope and accepts either a direct loop-report JSON file or a full `continuity:run-once` / `sync-once` artifact containing `continuity_loop_report`; the command extracts that report, records only loop evidence, and returns loop freshness and Cloudflare push posture without inventing Windows execution authority.

Create a governed Cloudflare operation from the operator CLI when the caller has Site authority:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:operation:create:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --display-name "Operator Work" --operation-kind productization --operator-session-file cloudflare-operator-session.json
```

`product:operation:create` calls `operation.create` through the same authenticated `POST /api/carrier` envelope as the console. It is a product mutation, not a readback command: the Worker still enforces Site authority, records the operation in the Site Registry, and returns a redacted `narada.cloudflare_carrier.operation_create.v1` envelope. Operation create uses the same canonical lifecycle statuses as operation status updates for initial creation: `active`, `inactive`, `needs_continuation`, and `closed` (`paused` is normalized to `inactive` for compatibility). Recreating an existing operation can update its name and kind, but preserves its current lifecycle status; use `product:operation:status` for lifecycle transitions. The `:text` alias prints the worker URL, auth source, site, operation id, name, kind, and status without echoing bearer tokens or operator-session cookies.

Move a governed Cloudflare operation through its lifecycle from the operator CLI:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:operation:status:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --status paused --reason operation_paused_by_operator --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:status:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --status closed --reason operation_closed_by_operator --operator-session-file cloudflare-operator-session.json
```

`product:operation:status` calls `operation.status.put` through authenticated `POST /api/carrier`. It supports `active`, `inactive`, `needs_continuation`, and `closed` (`paused` is normalized to `inactive` for compatibility), accepts optional `--reason` / `CLOUDFLARE_CARRIER_OPERATION_STATUS_REASON` transition evidence, leaves Site authority enforcement in the Worker, and returns a redacted `narada.cloudflare_carrier.operation_status_put.v1` envelope. `closed` is terminal: repeated close/archive updates are idempotent, but a closed operation cannot be reopened to `active`, `inactive`, or `needs_continuation`. The `:text` alias prints the worker URL, auth source, site, operation id, status, optional reason, worker-reported status transition, and update time without echoing bearer tokens or operator-session cookies.

Run the full governed operation lifecycle live when you need durable operator proof for create -> continuation -> resume -> close, using the same product commands and `operation.read` evidence the console consumes:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:operation:lifecycle:workflow:live -- --url <worker-url> --site <site-id> --operation-id <operation-id> --agent-id <agent-id> --operator-session-file cloudflare-operator-session.json --execute-operation-lifecycle
```

`product:operation:lifecycle:workflow:live` is an orchestrated live verifier, not a new mutation primitive. It calls `product:operation:create`, `product:operation:status`, `product:operation:continuation:resume`, and `product:operation:read` in sequence, and returns the readback summaries after each stage so the lifecycle route is proven from live product evidence instead of inferred from unit tests alone.

Run the adjacent continuation-selection live proof when the operator workflow should begin from `operation.list` rather than a remembered operation id:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:operation:continuation:workflow:live -- --url <worker-url> --site <site-id> --agent-id <agent-id> --operator-session-file cloudflare-operator-session.json --execute-operation-continuation-resume
```

`product:operation:continuation:workflow:live` is an orchestrated verifier over the existing continuation selector and resume product paths, not a new mutation primitive. It reads `operation.list --continuation`, selects the next queued continuation operation, optionally asserts `--operation-id` matches that selection, reads `operation.read`, runs `product:operation:continuation:resume`, then re-reads both `operation.read` and `operation.list` so the selected operation is proven to have left the continuation queue through live product evidence instead of manual control-room bridging.

Run the adjacent resident-dispatch live proof when an active operation has already resumed and `operation.read` is routing toward `start_resident_dispatch`:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:resident-dispatch:workflow:live -- --url <worker-url> --site <site-id> --operation-id <operation-id> --operator-session-file cloudflare-operator-session.json
```

`product:resident-dispatch:workflow:live` is the productized form of the existing resident-dispatch smoke verifier. It calls `resident_dispatch.primary_with_fallback.start`, confirms the decision through `resident_dispatch.primary_with_fallback.list`, then reads `operation.read` so the dispatch decision and started carrier session are proven from the same live product surfaces the console uses. It accepts the same bearer-token or operator-session auth sources as the newer operator product commands and returns a redacted `narada.cloudflare_carrier.resident_dispatch_live_smoke.v1` envelope with auth provenance, dispatch state, and readback counts.

Run the adjacent continuity-refresh live proof when `operation.read` has advanced past resident dispatch and is routing toward `refresh_site_continuity_loop`:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live -- --url <worker-url> --site <site-id> --operation-id <operation-id> --operator-session-file cloudflare-operator-session.json --execute-operation-continuity
```

`product:operation:continuity:workflow:live` is an orchestrated verifier over the existing continuity product path, not a new continuity primitive. It reads `operation.read`, requires the current workflow route to be `refresh_site_continuity_loop`, runs the existing live `continuity:run-once` execution path with the same operator auth, then reads both `operation.read` and `site.read` again so the continuity refresh is proven to have cleared that route through live product evidence instead of manual cross-checking.

Create a governed Cloudflare task lifecycle task from the operator CLI after explicit task-create cutover evidence exists:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:create:text -- --url <worker-url> --site <site-id> --title <task-title> --admission-id <admission-id> --admit-cloudflare-task-create --cutover-point-ref <cutover-ref> --governed-write-contract-ref <contract-ref> --confirmation-evidence-ref <evidence-ref> --operator-session-file cloudflare-operator-session.json
```

`product:task-lifecycle:create` calls `task_lifecycle.task_create.admit` through authenticated `POST /api/carrier`. Without `--admit-cloudflare-task-create`, it can request the Worker's refusal evidence for the retained Windows task lifecycle authority. With the admission flag, it requires explicit cutover, governed-write-contract, and confirmation-evidence refs before sending the Cloudflare task-create admission request. The `:text` alias prints the Worker URL, auth source, site, admission id, task id/number when admitted, decision, authority posture, and evidence refs without echoing bearer tokens or operator-session cookies.

Claim an existing governed Cloudflare task lifecycle task after explicit task-claim cutover evidence exists:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:claim:text -- --url <worker-url> --site <site-id> --task-id <task-id> --claimant-agent <agent-id> --admission-id <admission-id> --admit-cloudflare-task-claim --assignment-authority-ref <assignment-authority-ref> --cutover-point-ref <cutover-ref> --governed-write-contract-ref <contract-ref> --confirmation-evidence-ref <evidence-ref> --operator-session-file cloudflare-operator-session.json
```

`product:task-lifecycle:claim` calls `task_lifecycle.task_claim.admit` through authenticated `POST /api/carrier`. Without `--admit-cloudflare-task-claim`, it can request the Worker's refusal evidence for retained Windows task lifecycle authority. With the admission flag, it requires explicit assignment-authority, cutover, governed-write-contract, and confirmation-evidence refs before sending the Cloudflare task-claim admission request. The `:text` alias prints the Worker URL, auth source, site, admission id, task id/number when admitted, claimant, decision, authority posture, and evidence refs without echoing bearer tokens or operator-session cookies.

Report work on an existing claimed Cloudflare task lifecycle task after explicit task-report cutover evidence exists:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:report:text -- --url <worker-url> --site <site-id> --task-id <task-id> --reporter-agent <agent-id> --summary <summary> --changed-file <path> --verification '{"command":"pnpm --filter @narada2/cloudflare-carrier test","result":"passed"}' --admission-id <admission-id> --admit-cloudflare-task-report --report-authority-ref <report-authority-ref> --report-schema-ref <report-schema-ref> --changed-file-evidence-boundary-ref <changed-file-boundary-ref> --cutover-point-ref <cutover-ref> --governed-write-contract-ref <contract-ref> --confirmation-evidence-ref <evidence-ref> --operator-session-file cloudflare-operator-session.json
```

`product:task-lifecycle:report` calls `task_lifecycle.task_report.admit` through authenticated `POST /api/carrier`. Without `--admit-cloudflare-task-report`, it can request the Worker's refusal evidence for retained Windows task lifecycle authority. With the admission flag, it requires explicit report-authority, report-schema, changed-file-evidence-boundary, cutover, governed-write-contract, and confirmation-evidence refs before sending the Cloudflare task-report admission request. Reporting records changed-file evidence only as report evidence; separate changed-file-evidence, filesystem mutation, and repository publication boundaries remain not admitted until their own governed contracts admit them. The `:text` alias prints the Worker URL, auth source, site, admission id, task/report ids, reporter, decision, authority posture, changed-file evidence posture, and evidence refs without echoing bearer tokens or operator-session cookies.

Record changed-file evidence for an existing reported Cloudflare task lifecycle task after explicit changed-file-evidence cutover evidence exists:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:changed-file-evidence:text -- --url <worker-url> --site <site-id> --task-id <task-id> --report-id <report-id> --file-path <repo-relative-path> --reporter-agent <agent-id> --admission-id <admission-id> --admit-cloudflare-changed-file-evidence --file-evidence-authority-ref <file-evidence-authority-ref> --file-material-source-ref <file-material-source-ref> --repository-authority-ref <repository-authority-ref> --cutover-point-ref <cutover-ref> --governed-write-contract-ref <contract-ref> --confirmation-evidence-ref <evidence-ref> --operator-session-file cloudflare-operator-session.json
```

`product:task-lifecycle:changed-file-evidence` calls `task_lifecycle.changed_file_evidence.admit` through authenticated `POST /api/carrier`. Without `--admit-cloudflare-changed-file-evidence`, it can request the Worker's refusal evidence for retained Windows task lifecycle authority. With the admission flag, it requires explicit file-evidence-authority, file-material-source, repository-authority, cutover, governed-write-contract, and confirmation-evidence refs before sending the Cloudflare changed-file-evidence admission request. Admitting changed-file evidence still leaves filesystem mutation, repository publication, and projection write as `not_admitted`; this command records Cloudflare evidence for the changed file, not those downstream effects. The `:text` alias prints the Worker URL, auth source, site, admission id, task/report/evidence ids, file path, reporter, authority posture, conflict evidence, and the three downstream admission postures without echoing bearer tokens or operator-session cookies.

Bridge a task or operation outcome into an explicit Cloudflare site file change proposal before any materialization or publication step:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:site-file-change:proposal:text -- --url <worker-url> --site <site-id> --proposal-id <proposal-id> --proposal-ref <proposal-ref> --summary <proposal-summary> --operation-id <operation-id> --task-id <task-id> --file-path <repo-relative-path> --change-kind <create|update|delete> --material-source-ref <material-source-ref> --operator-session-file cloudflare-operator-session.json
```

`product:site-file-change:proposal` calls `site_file_change_proposal.record` through authenticated `POST /api/carrier`. It requires explicit proposal ref, summary, and per-file material provenance instead of relying on the Worker's generic defaults. The command fixes proposal authority at `cloudflare_carrier_site`, executor authority at `windows_filesystem_executor`, and keeps filesystem mutation and repository publication at `not_admitted`; it records Cloudflare proposal state only, without pretending the file was materialized or published. The `:text` alias prints the Worker URL, auth source, site, proposal id/ref, operation/task linkage, proposal posture, file count, downstream admission posture, and per-file provenance without echoing bearer tokens or operator-session cookies.

Admit Cloudflare-owned site file materialization after explicit cutover evidence exists, while keeping Windows filesystem mutation and repository publication outside the admitted boundary:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:site-file:materialization:text -- --url <worker-url> --site <site-id> --materialization-id <materialization-id> --proposal-id <proposal-id> --proposal-ref <proposal-ref> --file-path <repo-relative-path> --content-sha256 <sha256> --content-ref <content-ref> --operation-id <operation-id> --task-id <task-id> --admit-cloudflare-site-file-materialization --materialization-authority-ref <materialization-authority-ref> --cutover-point-ref <cutover-ref> --governed-write-contract-ref <contract-ref> --confirmation-evidence-ref <evidence-ref> --operator-session-file cloudflare-operator-session.json
```

`product:site-file:materialization` calls `site_file_materialization.admit` through authenticated `POST /api/carrier`. Without `--admit-cloudflare-site-file-materialization`, it can request the Worker's refusal evidence for missing cutover admission. With the admission flag, it requires explicit materialization-authority, cutover, governed-write-contract, and confirmation-evidence refs before sending the Cloudflare materialization admission request. The command fixes materialization authority at `cloudflare_carrier_site`, executor authority at `cloudflare_site_file_store`, and keeps Windows filesystem mutation and repository publication at `not_admitted`; it records Cloudflare site-file materialization state only, without pretending the Windows site filesystem or repository publication boundary moved. The `:text` alias prints the Worker URL, auth source, site, materialization id, proposal linkage, file path, content provenance, authority posture, and downstream admission posture without echoing bearer tokens or operator-session cookies.

Queue a governed Windows-side local ingress request after Cloudflare-side planning/materialization state exists, without claiming direct Cloudflare filesystem mutation:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:local-ingress:request:text -- --url <worker-url> --site <site-id> --local-ingress-request-id <request-id> --operation-id <operation-id> --task-id <task-id> --action-ref <local-action-ref> --summary <operator-summary> --contract-ref <contract-ref> --evidence-contract-ref <evidence-contract-ref> --rollback-ref <rollback-ref> --operator-session-file cloudflare-operator-session.json
```

`product:local-ingress:request` calls `local_ingress.request.create` through authenticated `POST /api/carrier`. It requires explicit action, governed request contract, evidence return contract, and rollback refs before sending the Cloudflare queue request. The command fixes request authority at `cloudflare_local_ingress_request_queue`, target authority at `local-windows-site-authority`, executor authority at `windows_local_ingress_executor`, and keeps both direct Cloudflare filesystem mutation and repository publication at `not_admitted`; it records a governed request for Windows execution and later evidence return, not the execution itself. The `:text` alias prints the Worker URL, auth source, site, local ingress request id, operation/task linkage, action summary, authority posture, queue/execution posture, and contract refs without echoing bearer tokens or operator-session cookies.

Record Windows execution evidence back into Cloudflare after a governed local ingress request has been admitted and executed:

```bash
pnpm --filter @narada2/cloudflare-carrier product:local-ingress:evidence:text -- --url <worker-url> --site <site-id> --local-ingress-request-id <request-id> --local-execution-id <execution-id> --changed-file <path-1> --changed-file <path-2> --rollback-evidence-ref <rollback-ref> --operator-session-file cloudflare-operator-session.json
```

`product:local-ingress:evidence` calls `local_ingress.evidence.put` through authenticated `POST /api/carrier`. It requires the governing request id, the Windows execution id, and at least one changed file before sending the evidence record. The command fixes requested mutation class at `local_repository_filesystem_mutation`, Windows admission action at `admit`, local execution status at `completed`, local filesystem mutation admission at `admitted_by_windows_local_ingress`, executor authority at `windows_local_ingress_executor`, and keeps both direct Cloudflare filesystem mutation and repository publication at `not_admitted`; it records the Windows-side execution evidence in Cloudflare without claiming direct Cloudflare filesystem authority. The `:text` alias prints the Worker URL, auth source, site, evidence/request/execution ids, authority partition, mutation admissions, changed files, rollback evidence ref, and record timestamps without echoing bearer tokens or operator-session cookies.

Queue a governed repository publication request after Windows-side filesystem evidence exists, without claiming direct Cloudflare Git push or repository mutation:

```bash
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:text -- --url <worker-url> --site <site-id> --repository-publication-request-id <request-id> --operation-id <operation-id> --task-id <task-id> --publication-ref <publication-ref> --action-ref <action-ref> --repository-ref <github:owner/repo> --branch-ref <branch-ref> --source-change-ref <git:commit:sha> --contract-ref <contract-ref> --evidence-contract-ref <evidence-contract-ref> --rollback-ref <rollback-ref> --operator-session-file cloudflare-operator-session.json
```

`product:repository-publication:request` calls `repository_publication.request.create` through authenticated `POST /api/carrier`. It requires explicit publication, repository, branch, source-change, governed request contract, evidence return contract, and rollback refs before sending the queue request. The command fixes request authority at `cloudflare_repository_publication_request_queue`, executor authority at `windows_repository_publication_executor`, leaves repository publication admission at `pending_windows_publication_admission`, and keeps both Cloudflare Git push and direct Cloudflare repository mutation at `not_admitted`; it records the governed Windows publication request, not publication execution itself. The `:text` alias prints the Worker URL, auth source, site, request id, operation/task linkage, publication/repository refs, authority posture, admission posture, and contract refs without echoing bearer tokens or operator-session cookies.

Record the Cloudflare admission decision for a queued repository publication request before Windows publishes:

```bash
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:admission:text -- --url <worker-url> --site <site-id> --repository-publication-request-id <request-id> --admission-action admit --admission-reason <reason-ref> --operator-session-file cloudflare-operator-session.json
```

`product:repository-publication:admission` calls `repository_publication.admission.classify` through authenticated `POST /api/carrier`. It requires the queued request id and an admission action, fixes admission authority at `cloudflare_repository_publication_admission_controller`, executor authority at `windows_repository_publication_executor`, and keeps both Cloudflare Git push and direct Cloudflare repository mutation at `not_admitted`; it governs whether Windows may publish, without pretending Cloudflare performed the publish. The `:text` alias prints the Worker URL, auth source, site, admission/request ids, decision, authority posture, downstream mutation posture, and record timestamps without echoing bearer tokens or operator-session cookies.

Record Windows repository publication evidence back into Cloudflare after governed publication resolves:

```bash
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:evidence:text -- --url <worker-url> --site <site-id> --repository-publication-request-id <request-id> --publication-execution-id <execution-id> --repository-ref <github:owner/repo> --branch-ref <branch-ref> --source-change-ref <git:commit:sha> --windows-admission-action admit --publication-status completed --published-commit-ref <git:commit:published-sha> --rollback-evidence-ref <rollback-ref> --operator-session-file cloudflare-operator-session.json
```

`product:repository-publication:evidence` calls `repository_publication.evidence.put` through authenticated `POST /api/carrier`. It requires the governing request id, the Windows publication execution id, repository/branch/source-change refs, and for admitted completion a published commit ref before sending the evidence record. The command fixes evidence-store authority at `cloudflare_repository_publication_evidence_store`, executor authority at `windows_repository_publication_executor`, keeps both Cloudflare Git push and direct Cloudflare repository mutation at `not_admitted`, and records the Windows publication outcome only after Cloudflare admission exists; it does not blur the line into direct Cloudflare publication authority. The `:text` alias prints the Worker URL, auth source, site, evidence/request/execution ids, admission linkage, publish outcome, authority partition, mutation posture, and rollback evidence ref without echoing bearer tokens or operator-session cookies.

Read whether the Cloudflare GitHub publication lane is configured and whether a repository/branch is currently allowed before requesting direct Cloudflare execution:

```bash
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:readiness:text -- --url <worker-url> --site <site-id> --repository-ref <github:owner/repo> --branch-ref <branch-ref> --operator-session-file cloudflare-operator-session.json
```

`product:repository-publication:readiness` calls `repository_publication.cloudflare_execution.readiness` through authenticated `POST /api/carrier`. It reads Cloudflare-held GitHub credential posture, allowed repository/branch policy, and requested repository/branch eligibility without mutating GitHub. The command fixes executor authority at `cloudflare_github_repository_publication_executor`, admission authority at `cloudflare_repository_publication_admission_controller`, keeps Cloudflare Git push at `not_admitted`, and reports whether direct Cloudflare repository mutation would be available if execution were later requested. The `:text` alias prints the Worker URL, auth source, site, readiness status, credential mode, requested repository/branch posture, missing configuration, and authority partition without echoing bearer tokens, operator-session cookies, or secret values.

Execute an already admitted repository publication directly through the Cloudflare GitHub executor when that lane is intentionally chosen:

```bash
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:text -- --url <worker-url> --site <site-id> --repository-publication-request-id <request-id> --repository-publication-execution-id <execution-id> --execute-cloudflare-github --operator-session-file cloudflare-operator-session.json
```

`product:repository-publication:cloudflare-execution` calls `repository_publication.cloudflare_execution.execute` through authenticated `POST /api/carrier`. It requires explicit `--execute-cloudflare-github` acknowledgement and a governed repository publication request id before Cloudflare may push to GitHub. This command is the direct-Cloudflare publication lane: it records execution under `cloudflare_github_repository_publication_executor`, links back to Cloudflare admission, keeps `cloudflare_git_push_admission` at `not_admitted`, and admits direct Cloudflare repository mutation only through this explicit execution boundary. The `:text` alias prints the Worker URL, auth source, site, request/execution ids, publication outcome, admission linkage, GitHub response summary, and authority partition without echoing bearer tokens or operator-session cookies.

Read the governed repository publication lane back as operator-visible queue, admission, evidence, and Cloudflare execution history:

```bash
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:list:text -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:next:text -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:admission:list:text -- --url <worker-url> --site <site-id> --repository-publication-request-id <request-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:evidence:list:text -- --url <worker-url> --site <site-id> --repository-publication-request-id <request-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url <worker-url> --site <site-id> --repository-publication-request-id <request-id> --operator-session-file cloudflare-operator-session.json
```

These aliases all route through `product:repository-publication:*` readback over authenticated `POST /api/carrier` and keep the authority boundary explicit instead of inferring publication state from smoke artifacts. `request:list` shows queued Windows publication requests, `request:next` shows the next admitted dispatch candidate and any pending-unadmitted backlog, `admission:list` shows Cloudflare admission history, `evidence:list` shows Windows execution evidence recorded back into Cloudflare, and `cloudflare-execution:list` shows direct Cloudflare GitHub execution history. The `:text` aliases print the Worker URL, auth source, site, latest ids/statuses, and authority posture without echoing bearer tokens or operator-session cookies.

After a live publication request has been admitted and resolved, verify that the operator readback lane exposes coherent request/admission/downstream evidence:

```bash
pnpm --filter @narada2/cloudflare-carrier repository-publication:readback-smoke:live -- --url <worker-url> --site <site-id> --repository-publication-request-id <request-id> --lane cloudflare --repository-publication-execution-id <execution-id> --operation-id <operation-id>
```

`repository-publication:readback-smoke:live` is a live verifier over the product read surfaces, not a second mutation path. It proves the request appears in `request:list`, the governing Cloudflare decision appears in `admission:list`, the downstream result appears in either `cloudflare-execution:list` or `evidence:list` depending on `--lane`, and `request:next` no longer selects the resolved request. When `--operation-id` is supplied, it also checks `operation.read` for the same downstream record so operator lifecycle readback stays coherent across both operation and publication views.

For the direct Cloudflare GitHub lane, use the workflow wrapper when one operator run should both execute the governed publication and prove the readback surface afterward:

```bash
pnpm --filter @narada2/cloudflare-carrier repository-publication:cloudflare-workflow:live -- --url <worker-url> --operator-session-file cloudflare-operator-session.json --site <site-id> --operation <operation-id> --repository-ref github:andrey-kokoev/narada --branch refs/heads/cloudflare-publication-live --commit <40-hex-commit> --execute-cloudflare-github
```

`repository-publication:cloudflare-workflow:live` is an orchestration wrapper over the existing execution and readback live-smoke commands. It does not create a separate mutation path. It first runs the governed Cloudflare publication execution, then immediately verifies that the same request, admission, execution, and operation lifecycle are visible through the readback product surfaces. The wrapper accepts either bearer-token auth or a captured operator session file/cookie, so this lane can run as a real authenticated operator workflow instead of a token-only maintenance path.

Finish an existing closed Cloudflare task lifecycle task after explicit task-finish cutover evidence exists:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:finish:text -- --url <worker-url> --site <site-id> --task-id <task-id> --finalizer-agent <agent-id> --finish-verdict accepted --admission-id <admission-id> --admit-cloudflare-task-finish --finish-authority-ref <finish-authority-ref> --finish-schema-ref <finish-schema-ref> --cutover-point-ref <cutover-ref> --governed-write-contract-ref <contract-ref> --confirmation-evidence-ref <evidence-ref> --operator-session-file cloudflare-operator-session.json
```

`product:task-lifecycle:finish` calls `task_lifecycle.task_finish.admit` through authenticated `POST /api/carrier`. Without `--admit-cloudflare-task-finish`, it can request the Worker's refusal evidence for retained Windows task lifecycle authority. With the admission flag, it requires explicit finish-authority, finish-schema, cutover, governed-write-contract, and confirmation-evidence refs before sending the Cloudflare task-finish admission request. The current Worker contract only admits `accepted` finish verdicts, so the product command rejects any other verdict locally instead of pretending a broader finish surface exists. The `:text` alias prints the Worker URL, auth source, site, admission id, task id/number when admitted, finalizer, verdict, decision, authority posture, changed-file-evidence count, and evidence refs without echoing bearer tokens or operator-session cookies.

For operator-facing readback without JSON inspection, use the text aliases:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:site:list:text -- --url <worker-url> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:site-continuity:publish:text -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:site-continuity:loop-report:text -- --url <worker-url> --site <site-id> --report-file .narada/site-continuity/<site-id>-cloudflare-sync.json --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:list:text -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:continuation:next:text -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:continuation:resume:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --agent-id <agent-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --operator-session-file cloudflare-operator-session.json
```

The text output names the operation, worker URL, auth source, selected site or operation, health, next action, continuity/reconciliation posture, durability posture, operation-list lifecycle status counts, operation-read lifecycle status transitions, and evidence counts while preserving the same credential redaction rule as the JSON envelope. The continuation selector filters the operation list for `needs_continuation`, prints the selected operation read command, and prints the resume command. By default, the resume command first reads `operation.read` and requires the workflow route to advertise `resume_operation_continuation`; only then does it transition the selected operation to `active` unless `--skip-activate` is passed and start a carrier session bound to that operation. Use `--skip-route-check` only for explicit recovery.

## Live Smoke

`smoke:live` requires a deployed Worker URL and a bearer token:

```powershell
pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url <worker-url> --token <token>
```

To require a specific live tool/effect posture:

```powershell
pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url <worker-url> --token <token> --expect-tool-effect-posture unconfigured
```

Use `configured` when the Worker was deployed with a configured tool/effect adapter. Live smoke checks the deployed console, `/api/carrier` API client path, posture, capabilities, routing, auth, provider execution, task create/update, persisted task readback, and event reads against a real Workers AI response. It does not force deterministic provider-selected tool-effect outcomes because live provider tool selection is model-dependent; deterministic denied, admitted-ok, and admitted-failed tool/effect outcomes are covered by `deploy:check`. The live token is not stored by this package. Rotate or set the Worker secret before running live smoke from a fresh shell.
