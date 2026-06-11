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

`continuity:run-once` is the product-facing alias for the existing live reconciliation execution path: it plans ready configured sites, runs guarded `sync-once`, writes the reconciliation execution artifact, and records that execution evidence back to Cloudflare. Use `NARADA_SITE_CONTINUITY_PACKET` for a single configured site. Use `NARADA_SITE_CONTINUITY_PACKET_DIR` for multiple configured sites; each site packet is resolved as `<file-safe-site-id>-packet.json` from that directory.

Read local-cloud continuity health, including local sync artifacts, last reconciliation execution, and live Windows Task Scheduler readback:

```powershell
pnpm --filter @narada2/cloudflare-carrier continuity:health
```

`continuity:health` loads the same local `.env` and `.narada/site-continuity/cloudflare-continuity.env` configuration as the scheduled-task wrapper, then attaches bounded Task Scheduler query evidence to the status output. It reports the installed task state, last result, next run, task command, and whether the host scheduler cadence matches the package plan.

Read the provider-liveness scheduler posture with the same operator-facing text style:

```powershell
pnpm --filter @narada2/cloudflare-carrier provider-liveness:status:live:text
```

`provider-liveness:status:live:text` performs a bounded live Task Scheduler readback for `\Narada\CloudflareProviderLivenessRefresh`. It reports whether the hidden `wscript.exe //B` wrapper is installed, whether the two-minute cadence matches the package plan, the last run result, the next run time, and any attention reasons without exposing credential values.

Read the last durable scheduled health snapshot without querying Cloudflare or Task Scheduler:

```powershell
pnpm --filter @narada2/cloudflare-carrier continuity:health:last
```

`continuity:health:last` reads `.narada/site-continuity/health/cloudflare-continuity-health-last.json`, the snapshot written by the scheduled continuity loop. It is distinct from `continuity:last`, which reads the last sync artifact. When the scheduled loop has Cloudflare carrier URL and auth available, the snapshot also includes compact `site.list` product posture evidence under `cloudflare_product_posture`, local binding coverage for the remote next site under `cloudflare_product_binding_alignment`, and `operation.list` posture for the next selected site under `cloudflare_operation_posture`, without embedding credential values. The readback summary also projects `operator_next_action`, `operator_next_target_site_id`, `operator_next_reason`, and `operator_next_source`; an unbound remote next site becomes `bind_cloudflare_product_next_site_locally` so the attention state names its next operator move.

Scheduled health also reports `cloudflare_product_binding_preparation`, which says whether the next local binding packet can be prepared from current evidence or is blocked by missing explicit `local_site_ref` / `cloudflare_site_ref` inputs.

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
pnpm --filter @narada2/cloudflare-carrier product:operation:list -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json --format summary
pnpm --filter @narada2/cloudflare-carrier product:operation:read -- --url <worker-url> --site <site-id> --operation-id <operation-id> --format summary
```

The command prints a `narada.cloudflare_carrier.product_read.v1` envelope by default, including `site.list`, `site.read`, `operation.list`, or `operation.read` response evidence and a compact summary. It records only `auth_source` in the output; bearer tokens and operator-session cookies are not echoed.

Create a governed Cloudflare operation from the operator CLI when the caller has Site authority:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:operation:create:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --display-name "Operator Work" --operation-kind productization --operator-session-file cloudflare-operator-session.json
```

`product:operation:create` calls `operation.create` through the same authenticated `POST /api/carrier` envelope as the console. It is a product mutation, not a readback command: the Worker still enforces Site authority, records the operation in the Site Registry, and returns a redacted `narada.cloudflare_carrier.operation_create.v1` envelope. The `:text` alias prints the worker URL, auth source, site, operation id, name, kind, and status without echoing bearer tokens or operator-session cookies.

Move a governed Cloudflare operation through its lifecycle from the operator CLI:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:operation:status:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --status paused --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:status:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --status closed --operator-session-file cloudflare-operator-session.json
```

`product:operation:status` calls `operation.status.put` through authenticated `POST /api/carrier`. It supports `active`, `paused`, and `closed`, leaves Site authority enforcement in the Worker, and returns a redacted `narada.cloudflare_carrier.operation_status_put.v1` envelope. The `:text` alias prints the worker URL, auth source, site, operation id, status, worker-reported status transition, and update time without echoing bearer tokens or operator-session cookies.

For operator-facing readback without JSON inspection, use the text aliases:

```powershell
pnpm --filter @narada2/cloudflare-carrier product:site:list:text -- --url <worker-url> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:list:text -- --url <worker-url> --site <site-id> --operator-session-file cloudflare-operator-session.json
pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url <worker-url> --site <site-id> --operation-id <operation-id> --operator-session-file cloudflare-operator-session.json
```

The text output names the operation, worker URL, auth source, selected site or operation, health, next action, continuity/reconciliation posture, durability posture, operation-list lifecycle status counts, operation-read lifecycle status transitions, and evidence counts while preserving the same credential redaction rule as the JSON envelope.

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
