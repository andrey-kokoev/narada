# Legacy provider/model selection — consumer inventory (#2186)

Status: authoritative inventory for the cutover. "Authoritative read" means
the env var decides which provider/model/path runs. Credential *transport*
(secrets, base URLs) is out of scope — those keep flowing; they carry
material, not selection.

## Selection-authoritative consumers (retire)

| # | Consumer | Read | Cutover disposition |
|---|----------|------|---------------------|
| 1 | `packages/agent-runtime-server/src/server-wrapper.mjs` | `NARADA_INTELLIGENCE_PROVIDER` fallback branch | Remove fallback; resolution becomes the only path (registry auto-provisioned from legacy catalog when missing) |
| 2 | `packages/nars-provider-runtime/src/provider-call.mjs:22` | `env.NARADA_INTELLIGENCE_PROVIDER` | Remove env fallback; `runtimeContext` carries the resolved binding only |
| 3 | `packages/nars-provider-runtime/src/provider-adapters.mjs:24,27` | module-level env seeding (`NARADA_INTELLIGENCE_PROVIDER`, `CODEX_MODEL`) | Remove seeding; per-call settings only |
| 4 | `packages/agent-runtime-server/src/runtime-context.mjs:17` | default param env read | Remove default |
| 5 | `packages/agent-start/src/narada-agent-start.ts:407` | launch input from env | Read from resolved plan instead |
| 6 | `packages/agent-start/src/provider-resolution.ts:72-78` | source attribution from env | Attribute to resolver/plan |
| 7 | `packages/agent-start/src/carrier-launch-adapter.ts:275,305,406` | codex scrub decisions keyed on provider env | Drive from resolved binding, not env name |
| 8 | `packages/agent-start/src/provider-credential-projection.ts:202-235` | projects `NARADA_INTELLIGENCE_PROVIDER`/`NARADA_AI_*` into child env | Project registry db path + site context envs instead |
| 9 | `packages/layers/cli/src/lib/launcher-runtime.ts:237-250` | passes `NARADA_INTELLIGENCE_PROVIDER` to subprocess | Drop |
| 10 | `packages/agent-runtime-server/templates/Start-AgentCliSession.ps1:201` | template sets the var | Remove line |
| 11 | `packages/agent-start/bin/verify-registered-site-launchers.mjs:297` | verifier requires the env var | Verify registry config instead |
| 12 | `packages/carrier-provider-contract/src/provider-runtime-binding-core.mjs:62-144` | env fallback chain (`NARADA_AI_*`, `model_env_names`) | Env stays for credential/base-url transport only; model/provider selection via overrides becomes mandatory |
| 13 | `packages/cloudflare-carrier/src/cloudflare-worker.mjs` | legacy-env branch (`CLOUDFLARE_CARRIER_AI_MODEL`, `AI_MODEL`, `DEFAULT_WORKERS_AI_MODEL`) | Remove branch; resolver mode is the only mode (catalog auto-seeds) |
| 14 | `packages/nars-capability-gateway/src/mcp-runtime.mjs:39-51` | env allowlist forwarding provider env names | Keep forwarding credential names only; drop selection names |

## Keep (credential/material transport, not selection)

- `*_API_KEY` / `*_API_TOKEN` secret env vars (KIMI, OPENAI, ANTHROPIC,
  DEEPSEEK, GLM, OPENROUTER, KIMI_CODE, CLOUDFLARE).
- `*_BASE_URL` endpoint env overrides — endpoint material; long-term these
  migrate into endpoint resources, but they are not *model/provider
  selection* and remain legitimate during cutover.
- `NARADA_CODEX_EXEC_COMMAND` / `NARADA_CODEX_EXEC_PREFIX_ARGS` — process
  transport.

## Test fixtures (allowed)

Test-file reads of `NARADA_INTELLIGENCE_PROVIDER`, `CODEX_MODEL`,
`OPENAI_MODEL`, etc. are explicit fixtures and out of scope per the task's
"outside explicit migration fixtures" carve-out. Tests that assert the
*projection* of selection env (agent-start option-contract,
provider-module-contract, launcher-runtime tests) will be updated with the
projection change in the same commit.

## Migration path for unconfigured deployments

Both runtimes auto-provision, so removing env selection cannot strand an
unconfigured deployment:

- Local: `server-wrapper` opens `<site_root>/.ai/intelligence-registry.db`,
  migrating the bundled legacy `provider-registry.json` into it when empty
  (management package migrator), then resolves.
- Cloudflare: the carrier's `ensureCloudflareIntelligenceCatalog` already
  seeds the D1 registry idempotently (#2185).

## Compat projection

Removed 2026-07-19: zero consumers outside the producing package
(`projectLegacyRegistry`, CLI `compat`, `intelligence_compat_projection`,
their tests). Deletion verified by repo grep.
