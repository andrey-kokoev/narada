import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const naradaProperRoot = resolve(packageRoot, '..', '..');
const providerRegistry = JSON.parse(readFileSync(resolve(naradaProperRoot, 'packages', 'carrier-provider-contract', 'contracts', 'provider-registry.json'), 'utf8'));
const metadataByProvider = providerRegistry.providers;
const admittedProviders = Object.keys(metadataByProvider);

const providerResolution = await import(pathToFileURL(resolve(packageRoot, 'src', 'provider-resolution.ts')));
const providerCredentials = await import(pathToFileURL(resolve(packageRoot, 'src', 'provider-credential-projection.ts')));
const codexSupport = await import(pathToFileURL(resolve(packageRoot, 'src', 'codex-subscription-support.ts')));

test('provider resolution module preserves default provider source and output fields', () => {
  const resolution = providerResolution.resolveIntelligenceProviderLaunch(null, 'agent-cli', { source_field: null }, {
    metadataByProvider,
    admittedProviders,
    defaultProvider: providerRegistry.default_provider,
    schema: providerResolution.INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
  assert.equal(resolution.intelligence_provider, 'kimi-code-api');
  assert.equal(resolution.source_field, 'default_for_agent_cli');
  assert.equal(resolution.request_adapter, 'openai-compatible-chat-completions');
  assert.equal(resolution.credential_requirement_kind, 'api_key_secret');
  assert.equal(resolution.credential_requirement.secret_ref, 'narada/provider/kimi-code-api/api-key');
  assert.equal(resolution.resolution_states.at(-1).state, 'launch_ready');
});

test('provider resolution module refuses provider selection for non-agent-cli runtimes', () => {
  const refusal = providerResolution.resolveIntelligenceProviderLaunch('codex-subscription', 'codex', { source_field: 'cli_argument' }, {
    metadataByProvider,
    admittedProviders,
    defaultProvider: providerRegistry.default_provider,
    schema: providerResolution.INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
  assert.equal(refusal.status, 'refused');
  assert.equal(refusal.reason_code, 'intelligence_provider_runtime_unsupported');
  assert.equal(refusal.runtime_substrate_kind, 'codex');
});

test('credential projection redacts API secrets while projecting required env', () => {
  const resolution = providerResolution.resolveIntelligenceProviderLaunch('kimi-api', 'agent-cli', { source_field: 'cli_argument' }, {
    metadataByProvider,
    admittedProviders,
    defaultProvider: providerRegistry.default_provider,
    schema: providerResolution.INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
  const projected = providerCredentials.intelligenceProviderEnvironmentProjection(resolution, {
    metadataByProvider,
    processEnv: {
      NARADA_PROVIDER_SECRET_STORE: 'disabled',
      KIMI_API_KEY: 'module-secret-value',
    },
    codexSubscriptionPreflight: () => ({ ok: true, status: 'deferred_until_first_provider_call' }),
  });
  assert.equal(projected.env.KIMI_API_KEY, 'module-secret-value');
  assert.equal(projected.credential.credential_source, 'environment');
  assert.equal(Object.hasOwn(projected.credential, 'value'), false);
  assert.doesNotMatch(JSON.stringify(projected.credential), /module-secret-value/);
});

test('codex subscription support defers normal dry-run auth and scrubs OpenAI API env', () => {
  const processEnv = {
    OPENAI_API_KEY: 'stale-api-key',
    OPENAI_BASE_URL: 'https://stale.example',
    OPENAI_MODEL: 'stale-model',
    USERPROFILE: 'C:/Users/Andrey',
  };
  const preflight = codexSupport.codexSubscriptionPreflight('codex-subscription', {
    processEnv,
    sessionSiteRoot: naradaProperRoot,
    dryRun: true,
  });
  assert.equal(preflight.status, 'deferred_until_first_provider_call');
  assert.equal(preflight.ok, true);
  const env = codexSupport.codexSubscriptionPreflightEnv(processEnv);
  assert.equal(Object.hasOwn(env, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'OPENAI_BASE_URL'), false);
  assert.equal(Object.hasOwn(env, 'OPENAI_MODEL'), false);
  assert.equal(normalize(env.NARADA_CODEX_AUTH_HOME), normalize('C:/Users/Andrey/.codex'));
});
