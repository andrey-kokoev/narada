# Agent-start Provider Decomposition

## Current Boundary Inventory

`packages/agent-start/src/narada-agent-start.ts` is the orchestration boundary. It parses CLI arguments, loads Site environment, materializes the agent start event, validates MCP fabric, builds launch output, and spawns the selected carrier.

Provider and credential responsibilities now live behind focused modules:

- `provider-resolution.ts` owns provider registry loading, provider source attribution, provider support-state interpretation, default provider selection, runtime/provider refusal packets, and `intelligence_provider_resolution` shape.
- `provider-credential-projection.ts` owns provider credential requirements, SecretManagement/SecretStore lookup, environment credential source lookup, redaction, required environment projection, MCP child credential projection, and missing-credential refusal packets.
- `codex-subscription-support.ts` owns local Codex subscription preflight mode, Codex CLI preflight command resolution including Windows `codex.ps1`, OpenAI API env scrubbing, Codex auth-home discovery, Codex CLI script discovery for carrier launch, and Codex context-isolation status.
- `carrier-launch-adapter.ts` still owns runtime-specific carrier argv/env/handoff descriptors. Provider modules do not choose carrier command shape.

## Caller Contracts

The launcher caller supplies runtime state explicitly: runtime substrate kind, provider input and source, provider metadata, process environment, `sessionSiteRoot`, and dry-run/exec mode. The extracted modules return plain data packets; they do not materialize sessions, load MCP fabric, write launch result files, or spawn carriers.

The launcher output contract is owned by the current carrier/runtime vocabulary:

- `intelligence_provider_resolution.source_field` remains `cli_argument`, `site_env`, `environment`, `launcher_env`, or `default_for_agent_cli` as before.
- Credential values are only present in child process environment maps before redaction; dry-run and test output use redacted environment values and credential packets omit raw `value`.
- `local_codex_subscription` reports `deferred_until_first_provider_call` unless `NARADA_CODEX_SUBSCRIPTION_PREFLIGHT=force` requests the bounded live probe.
- Missing API credentials still fail with `intelligence_provider_credential_missing`; forced Codex subscription failures still fail with `local_codex_subscription_auth_unavailable`.

## Migration Order

1. Extract provider registry loading and provider resolution into `provider-resolution.ts`; keep launcher output fields covered by explicit contract tests.
2. Extract credential requirement interpretation, SecretStore lookup, environment credential source lookup, redaction, and MCP child projection into `provider-credential-projection.ts`.
3. Extract Codex subscription preflight, CLI path discovery, auth-home handling, API env scrubbing, and context-isolation status into `codex-subscription-support.ts`.
4. Add module-boundary tests for the extracted seams, then keep the existing option-contract tests as the launch-contract guard.
5. Run `pnpm --filter @narada2/agent-start test` and the cross-Site coherence audit after each behavior-touching slice.

## Test Matrix

Focused package tests:

- `test/provider-module-contract.test.mjs` covers provider default resolution, runtime/provider refusal, credential redaction/projection, and Codex deferred preflight/env scrubbing.
- `test/option-contract.test.mjs` covers CLI argument source, target-Site env source, ambient environment source, registry default, missing API credential failure, provider-specific secret refs, Codex forced-auth failure, Windows `codex.ps1` preflight resolution, API env scrubbing, MCP child credential projection, unsupported runtime/provider combinations, native shell disablement, and context-isolation output.
- `test/launcher-registry-contract.test.mjs` covers registry shape and representative carrier dry-runs.

Cross-Site audit uses record shards so each command remains bounded. Increase
`--record-offset` by `--record-limit` until the verifier reports no more selected
records. Each launch dry-run is bounded by `--launch-timeout-ms`, defaulting to
8500 ms.

- `node packages/agent-start/bin/verify-registered-site-launchers.mjs --registry C:/Users/Andrey/Narada/config/launch/agents.psd1 --start-agent C:/Users/Andrey/Narada/Start-NaradaAgent.ps1 --runtime-policy default-only --record-offset 0 --record-limit 1` validates registered Site launcher shape and default carrier dry-runs for one shard.
- `node packages/agent-start/bin/verify-registered-site-launchers.mjs --registry C:/Users/Andrey/Narada/config/launch/agents.psd1 --start-agent C:/Users/Andrey/Narada/Start-NaradaAgent.ps1 --runtime-policy agent-tui-only --record-offset 0 --record-limit 1` validates the agent-tui carrier path for one shard.

## Residual Risks

- `narada-agent-start.ts` remains a large orchestration file. Provider extraction reduces one mixed concern, but future slices should continue moving carrier-specific branches behind adapter modules.
- SecretStore lookup still shells out to `pwsh` from the credential module. That preserves current behavior but remains slower and less directly unit-testable than a first-class SecretManagement adapter.
- MCP child credential projection intentionally projects every available API-backed provider credential for MCP child surfaces. It is redacted from output, but the runtime environment remains sensitive and must not be logged raw.
- Dry-run coverage is representative, not full Cartesian coverage of every Site/runtime/provider/flag combination.
