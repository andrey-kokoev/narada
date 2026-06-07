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

Unsupported tools remain denied with `unsupported_tool_effect`; the requested tool name remains visible in the tool result payload. Tool results also carry structured `admission_action` and `admission_reason` fields when the boundary admits or denies the effect. Admitted runtime metadata, KV get, and KV put effects carry `capability_ref`, `effect_scope`, and `authority_ref` evidence. If a principal lacks matching `controlled_actions`, the carrier records `tool_effect_authority_denied`.

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

The Worker requires bearer auth before routing to the Durable Object.

Accepted secret bindings:

- `ADMIN_BEARER_TOKEN` or `CLOUDFLARE_CARRIER_ADMIN_TOKEN`
- `SERVICE_TOKEN` or `CLOUDFLARE_CARRIER_SERVICE_TOKEN`

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

## Deploy Check Coverage

`deploy:check` verifies:

- Wrangler config shape;
- Durable Object binding;
- Workers AI binding;
- auth and principal evidence;
- Durable Object routing and snapshot reload;
- tool/effect admission classifier behavior;
- deny-by-default tool/effect result evidence;
- configured tool/effect admission for `cloudflare_carrier_runtime_metadata_read`, `cloudflare_carrier_kv_get`, and `cloudflare_carrier_kv_put`;
- configured KV write execution failure after admission, proving admitted `failed` result evidence is distinct from boundary denial;
- thrown tool-effect adapter failures, proving pre-admission boundary execution failures are still recorded as `tool_result_received` with `status: failed`.

## Live Smoke

`smoke:live` requires a deployed Worker URL and a bearer token:

```powershell
pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url <worker-url> --token <token>
```

To require a specific live tool/effect posture:

```powershell
pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url <worker-url> --token <token> --expect-tool-effect-posture unconfigured
```

Use `configured` when the Worker was deployed with a configured tool/effect adapter. Live smoke checks deployed posture, capabilities, routing, auth, provider execution, and event reads against a real Workers AI response. It does not force deterministic tool-effect outcomes because live provider tool selection is model-dependent; deterministic denied, admitted-ok, and admitted-failed tool/effect outcomes are covered by `deploy:check`. The live token is not stored by this package. Rotate or set the Worker secret before running live smoke from a fresh shell.
