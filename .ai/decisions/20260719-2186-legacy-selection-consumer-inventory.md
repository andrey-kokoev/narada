# Legacy provider/model selection — consumer inventory (#2186)

Status: authoritative inventory for the cutover. "Authoritative read" means
the env var decides which provider/model/path runs. Credential *transport*
(secrets, base URLs) is out of scope — those keep flowing; they carry
material, not selection.

## Retired selection-authority paths (verified absent)

The exact retired symbols are recorded only as strict negative-contract markers;
ordinary prose containing one of these symbols fails the zero-consumer guard.

<!-- narada:legacy-selection-negative:v1 symbol="NARADA_INTELLIGENCE_PROVIDER" disposition="retired" -->
<!-- narada:legacy-selection-negative:v1 symbol="CODEX_MODEL" disposition="retired" -->
<!-- narada:legacy-selection-negative:v1 symbol="CLOUDFLARE_CARRIER_AI_MODEL" disposition="retired" -->
<!-- narada:legacy-selection-negative:v1 symbol="@narada2/carrier-provider-contract" disposition="removed" -->
<!-- narada:legacy-selection-negative:v1 symbol="packages/carrier-provider-contract" disposition="removed" -->

| # | Former consumer | Negative contract |
|---|-----------------|-------------------|
| 1 | `packages/agent-runtime-server/src/server-wrapper.mjs` | The former provider selector is never read as fallback authority; canonical resolution is the only path |
| 2 | `packages/nars-provider-runtime/src/provider-call.mjs` | The former provider selector is never read from the environment; `runtimeContext` carries only the resolved binding |
| 3 | `packages/nars-provider-runtime/src/provider-adapters.mjs` | Provider/model environment seeding is absent |
| 4 | `packages/agent-runtime-server/src/runtime-context.mjs` | The former environment-derived default parameter is removed |
| 5 | `packages/agent-start/src/narada-agent-start.ts` | Launch selection is read only from the resolved plan |
| 6 | `packages/agent-start/src/provider-resolution.ts` | Source attribution is derived from resolver/plan evidence |
| 7 | `packages/agent-start/src/carrier-launch-adapter.ts` | Codex scrubbing is driven by resolved binding, not an environment-selected provider |
| 8 | `packages/agent-start/src/provider-credential-projection.ts` | Selection values are never projected into child environments; only secret transport and Site context remain |
| 9 | `packages/layers/cli/src/lib/launcher-runtime.ts` | Selection values are never passed to subprocesses |
| 10 | `packages/agent-runtime-server/templates/Start-AgentCliSession.ps1` | The former selection variable assignment is removed |
| 11 | `packages/agent-start/bin/verify-registered-site-launchers.mjs` | The verifier admits registry configuration, never a selection environment variable |
| 12 | Retired carrier/provider projection package | The package is removed; credential/base-url transport remains elsewhere, while selection comes only from the canonical plan |
| 13 | `packages/cloudflare-carrier/src/cloudflare-worker.mjs` | The former model selector is never selected; resolver mode is the only mode and uninitialized D1 authority is refused |
| 14 | `packages/nars-capability-gateway/src/mcp-runtime.mjs` | Selection values are never forwarded; only credential names remain in the allowlist |

## Keep (credential/material transport, not selection)

- `*_API_KEY` / `*_API_TOKEN` secret env vars (KIMI, OPENAI, ANTHROPIC,
  DEEPSEEK, GLM, OPENROUTER, KIMI_CODE, CLOUDFLARE).
- `*_BASE_URL` endpoint env overrides — endpoint material; long-term these
  migrate into endpoint resources, but they are not *model/provider
  selection* and remain legitimate during cutover.
- `NARADA_CODEX_EXEC_COMMAND` / `NARADA_CODEX_EXEC_PREFIX_ARGS` — process
  transport.

## Test fixtures (allowed)

Test-file references to retired selection symbols are explicit legacy fixtures
and out of scope per the task's
"outside explicit migration fixtures" carve-out. Tests that assert the
*projection* of selection env (agent-start option-contract,
provider-module-contract, launcher-runtime tests) will be updated with the
projection change in the same commit.

## Migration path for unconfigured deployments

Neither runtime auto-provisions authority. Removing environment selection
therefore makes registry admission an explicit operator/deployment action:

- Local: `server-wrapper` opens `<site_root>/.ai/intelligence-registry.db`
  and refuses a missing, empty, or invalid canonical registry. The management
  CLI performs any explicit, reviewed legacy migration before runtime startup.
- Cloudflare: deployment materializes an approved canonical catalog into D1.
  The Worker refuses an uninitialized catalog instead of inventing defaults.

## Compat projection

Temporarily retained as the exact `carrier.provider_registry` key through
task #2219. Reads are generated only from admitted canonical-v2 records,
deeply read-only, explicitly deprecated, and require bounded telemetry naming
the call site, configuration key, and migration owner. Unknown keys, writes,
uninitialized authority, and uninstrumented reads are refused.

Removal requires an admitted repository-wide zero-consumer inventory, accepted
local and Cloudflare cutover reviews, and task #2219 final acceptance. Historical
task/review evidence is non-authoritative; authoritative decisions remain
subject to the stale-governance check.
