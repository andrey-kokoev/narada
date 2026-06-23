# Agent-start Provider Decomposition

## Current Boundary Inventory

`packages/agent-start/src/narada-agent-start.ts` is the orchestration boundary. It parses CLI arguments, loads Site environment, materializes the agent start event, validates MCP fabric, builds launch output, and spawns the selected carrier.

Provider and credential responsibilities now live behind focused modules:

- `provider-resolution.ts` owns provider registry loading, provider source attribution, provider support-state interpretation, default provider selection, runtime/provider refusal packets, and `intelligence_provider_resolution` shape.
- `provider-credential-projection.ts` owns provider credential requirements, SecretManagement/SecretStore lookup, environment fallback, redaction, required environment projection, MCP child credential projection, and missing-credential refusal packets.
- `codex-subscription-support.ts` owns local Codex subscription preflight mode, Codex CLI preflight command resolution including Windows `codex.ps1`, OpenAI API env scrubbing, Codex auth-home discovery, Codex CLI script discovery for carrier launch, and Codex context-isolation status.
- `carrier-launch-adapter.ts` still owns runtime-specific carrier argv/env/handoff descriptors. Provider modules do not choose carrier command shape.

## Caller Contracts

The launcher caller supplies runtime state explicitly: runtime substrate kind, provider input and source, provider metadata, process environment, `sessionSiteRoot`, and dry-run/exec mode. The extracted modules return plain data packets; they do not materialize sessions, load MCP fabric, write launch result files, or spawn carriers.

The output compatibility contract is unchanged:

- `intelligence_provider_resolution.source_field` remains `cli_argument`, `site_env`, `environment`, `launcher_env`, or `default_for_agent_cli` as before.
- Credential values are only present in child process environment maps before redaction; dry-run and test output use redacted environment values and credential packets omit raw `value`.
- `local_codex_subscription` reports `deferred_until_first_provider_call` unless `NARADA_CODEX_SUBSCRIPTION_PREFLIGHT=force` requests the bounded live probe.
- Missing API credentials still fail with `intelligence_provider_credential_missing`; forced Codex subscription failures still fail with `local_codex_subscription_auth_unavailable`.

## Migration Order

1. Extract provider registry loading and provider resolution into `provider-resolution.ts`; keep launcher output fields byte-compatible at the JSON-shape level.
2. Extract credential requirement interpretation, SecretStore lookup, environment fallback, redaction, and MCP child projection into `provider-credential-projection.ts`.
3. Extract Codex subscription preflight, CLI path discovery, auth-home handling, API env scrubbing, and context-isolation status into `codex-subscription-support.ts`.
4. Add module-boundary tests for the extracted seams, then keep the existing option-contract tests as the compatibility guard.
5. Run `pnpm --filter @narada2/agent-start test` and the cross-Site coherence audit after each behavior-touching slice.

## Test Matrix

Focused package tests:

- `test/provider-module-contract.test.mjs` covers provider default resolution, runtime/provider refusal, credential redaction/projection, and Codex deferred preflight/env scrubbing.
- `test/option-contract.test.mjs` covers CLI argument source, target-Site env source, ambient environment source, registry default, missing API credential failure, provider-specific secret refs, Codex forced-auth failure, Windows `codex.ps1` preflight resolution, API env scrubbing, MCP child credential projection, unsupported runtime/provider combinations, native shell disablement, and context-isolation output.
- `test/launcher-registry-contract.test.mjs` covers registry shape and representative carrier dry-runs.

Cross-Site audit:

- `pwsh -NoProfile -File C:\Users\Andrey\Narada\tools\agent-start\Test-AgentStartCoherence.ps1` validates registered Site launchers, dry-run carrier/provider shape, wrapper coherence, and launcher option coverage.

## Residual Risks

- `narada-agent-start.ts` remains a large orchestration file. Provider extraction reduces one mixed concern, but future slices should continue moving carrier-specific branches behind adapter modules.
- SecretStore lookup still shells out to `pwsh` from the credential module. That preserves current behavior but remains slower and less directly unit-testable than a first-class SecretManagement adapter.
- MCP child credential projection intentionally projects every available API-backed provider credential for MCP child surfaces. It is redacted from output, but the runtime environment remains sensitive and must not be logged raw.
- Dry-run coverage is representative, not full Cartesian coverage of every Site/runtime/provider/flag combination.
