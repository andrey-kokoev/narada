import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
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
const aiProcessInvocation = await import('@narada2/carrier-provider-support/ai-process-invocation');

test('provider resolution module preserves default provider source and output fields', () => {
  const resolution = providerResolution.resolveIntelligenceProviderLaunch(null, 'agent-cli', { source_field: null }, {
    metadataByProvider,
    admittedProviders,
    defaultProvider: providerRegistry.default_provider,
    schema: providerResolution.INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
  assert.equal(resolution.intelligence_provider, 'kimi-code-api');
  assert.equal(resolution.source_field, 'default_for_nars_operator_surface');
  assert.equal(resolution.request_adapter, 'openai-compatible-chat-completions');
  assert.equal(resolution.credential_requirement_kind, 'api_key_secret');
  assert.equal(resolution.credential_requirement.secret_ref, 'narada/provider/kimi-code-api/api-key');
  assert.equal(resolution.resolution_states.at(-1).state, 'launch_ready');
});

test('provider resolution module admits agent-web-ui as a NARS operator surface', () => {
  const resolution = providerResolution.resolveIntelligenceProviderLaunch(null, 'agent-web-ui', { source_field: null }, {
    metadataByProvider,
    admittedProviders,
    defaultProvider: providerRegistry.default_provider,
    schema: providerResolution.INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
  assert.equal(resolution.intelligence_provider, 'kimi-code-api');
  assert.equal(resolution.source_field, 'default_for_nars_operator_surface');
  assert.equal(resolution.resolution_states.some((state) => state.state === 'carrier_supports_provider_selection' && state.carrier_kind === 'agent-web-ui'), true);
});

test('provider resolution module refuses provider selection for non-NARS carriers', () => {
  const refusal = providerResolution.resolveIntelligenceProviderLaunch('codex-subscription', 'codex', { source_field: 'cli_argument' }, {
    metadataByProvider,
    admittedProviders,
    defaultProvider: providerRegistry.default_provider,
    schema: providerResolution.INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
  assert.equal(refusal.status, 'refused');
  assert.equal(refusal.reason_code, 'intelligence_provider_runtime_unsupported');
  assert.equal(refusal.carrier_kind, 'codex');
  assert.match(refusal.reason, /NARS operator surfaces such as agent-cli or agent-web-ui/);
  assert.doesNotMatch(refusal.reason, /-Carrier/);
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
      OPENAI_API_KEY: 'unrelated-openai-decoy',
      KIMI_CODE_API_KEY: 'unrelated-kimi-code-decoy',
    },
    codexSubscriptionPreflight: () => ({ ok: true, status: 'passed' }),
  });
  assert.equal(projected.env.KIMI_API_KEY, 'module-secret-value');
  assert.equal(projected.env.NARADA_AI_API_KEY, 'module-secret-value');
  assert.equal(projected.env.NARADA_INTELLIGENCE_PROVIDER, 'kimi-api');
  assert.equal(projected.env.NARADA_AI_BASE_URL, 'https://api.moonshot.ai');
  assert.equal(Object.hasOwn(projected.env, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(projected.env, 'KIMI_CODE_API_KEY'), false);
  assert.equal(projected.credential.credential_source, 'environment');
  assert.equal(Object.hasOwn(projected.credential, 'value'), false);
  assert.doesNotMatch(JSON.stringify(projected.credential), /module-secret-value/);
  assert.equal(projected.runtime_binding.provider_id, 'kimi-api');
  assert.match(projected.runtime_binding.credential_fingerprint, /^sha256:[a-f0-9]{12}$/);
  assert.equal(Object.hasOwn(projected.runtime_binding, 'api_key'), false);
});

test('codex subscription support defers dry-run auth and scrubs OpenAI API env', () => {
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
  assert.equal(preflight.status, 'deferred_for_dry_run');
  assert.equal(preflight.ok, true);
  const env = codexSupport.codexSubscriptionPreflightEnv(processEnv);
  assert.equal(Object.hasOwn(env, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'OPENAI_BASE_URL'), false);
  assert.equal(Object.hasOwn(env, 'OPENAI_MODEL'), false);
  assert.equal(normalize(env.NARADA_CODEX_AUTH_HOME), normalize('C:/Users/Andrey/.codex'));
});

test('codex subscription support runs live auth preflight for non-dry launch by default', () => {
  const calls = [];
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-live-'));
  const preflight = codexSupport.codexSubscriptionPreflight('codex-subscription', {
    processEnv: { USERPROFILE: 'C:/Users/Andrey' },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    dryRun: false,
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    stderr: { write() {} },
  });
  try {
    assert.equal(preflight.status, 'passed_fresh');
    assert.equal(preflight.ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args.slice(-3, -1), ['exec', '--json']);
    assert.equal(Object.hasOwn(calls[0].options.env, 'OPENAI_API_KEY'), false);
    assert.equal(preflight.ai_process_invocation.event, 'launch');
    assert.equal(preflight.ai_process_invocation.projection, 'codex-subscription');
    assert.equal(preflight.ai_process_invocation.purpose, 'auth_probe');
    assert.equal(preflight.ai_process_invocation.adapter_kind, 'codex');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('codex subscription preflight refuses duplicate AiProcessInvocation before spawnSync', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-duplicate-'));
  const processEnv = {
    USERPROFILE: 'C:/Users/Andrey',
    CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS: '0',
  };
  const command = codexSupport.codexPreflightCommand(processEnv, 'linux');
  const argv = [...command.prefixArgs, 'exec', '--json', 'Return exactly: ok'];
  const env = codexSupport.codexSubscriptionPreflightEnv(processEnv);
  const first = aiProcessInvocation.admitAiProcessInvocation({
    adapterKind: 'codex',
    projection: 'codex-subscription',
    purpose: 'auth_probe',
    siteRoot,
    cwd: siteRoot,
    command: command.command,
    argv,
    env,
  }, { ownerPid: process.pid });
  let called = false;
  try {
    const preflight = codexSupport.codexSubscriptionPreflight('codex-subscription', {
      processEnv,
      processPlatform: 'linux',
      sessionSiteRoot: siteRoot,
      dryRun: false,
      spawnSync() {
        called = true;
        return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
      },
      stderr: { write() {} },
    });
    assert.equal(called, false);
    assert.equal(preflight.status, 'failed');
    assert.equal(preflight.ok, false);
    assert.equal(preflight.ai_process_invocation.event, 'refusal');
    assert.equal(preflight.ai_process_invocation.reason, 'duplicate_live_invocation');
  } finally {
    aiProcessInvocation.releaseAiProcessInvocationLease(first);
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('codex subscription support caches successful live auth preflight in User Site state briefly', () => {
  const calls = [];
  const progress = [];
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-cache-'));
  const userSiteRoot = mkdtempSync(join(tmpdir(), 'narada-user-site-codex-preflight-cache-'));
  const options = {
    processEnv: { USERPROFILE: 'C:/Users/Andrey', CODEX_MODEL: 'gpt-5.5' },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    userSiteRoot,
    dryRun: false,
    now: () => 1000,
    spawnSync(command, args, spawnOptions) {
      calls.push({ command, args, options: spawnOptions });
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    progressStream: { write: (line) => progress.push(line) },
  };
  try {
    const first = codexSupport.codexSubscriptionPreflight('codex-subscription', options);
    const second = codexSupport.codexSubscriptionPreflight('codex-subscription', { ...options, now: () => 2000 });
    assert.equal(first.status, 'passed_fresh');
    assert.equal(second.status, 'passed_cached');
    assert.equal(second.cache.status, 'hit');
    assert.equal(calls.length, 1);
    assert.equal(progress.length, 1);
    assert.match(progress[0], /Checking codex-subscription local Codex subscription auth/);
    assert.equal(second.cache.locus, 'user-site');
    assert.equal(normalize(second.cache.auth_home), normalize('C:/Users/Andrey/.codex'));
    assert.equal(second.cache.path, join(userSiteRoot, '.narada', 'runtime', 'provider-auth-cache', 'codex-subscription-preflight-cache.json'));
    assert.equal(existsSync(second.cache.path), true);
    assert.equal(existsSync(join(siteRoot, '.ai', 'runtime', 'codex-subscription-preflight-cache.json')), false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
    rmSync(userSiteRoot, { recursive: true, force: true });
  }
});

test('codex subscription support refresh mode bypasses successful cache', () => {
  const calls = [];
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-force-'));
  const baseOptions = {
    processEnv: { USERPROFILE: 'C:/Users/Andrey' },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    dryRun: false,
    now: () => 1000,
    spawnSync() {
      calls.push('spawn');
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    progressStream: { write() {} },
  };
  try {
    assert.equal(codexSupport.codexSubscriptionPreflight('codex-subscription', baseOptions).status, 'passed_fresh');
    assert.equal(codexSupport.codexSubscriptionPreflight('codex-subscription', {
      ...baseOptions,
      processEnv: { USERPROFILE: 'C:/Users/Andrey', NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'refresh' },
      now: () => 2000,
    }).status, 'passed_fresh');
    assert.equal(calls.length, 2);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('codex subscription support invalidates cache when the codex command identity changes', () => {
  const calls = [];
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-command-'));
  const userSiteRoot = mkdtempSync(join(tmpdir(), 'narada-user-site-codex-preflight-command-'));
  const options = {
    processEnv: {
      USERPROFILE: 'C:/Users/Andrey',
      NARADA_CODEX_AUTH_HOME: join(userSiteRoot, '.codex-auth'),
      NARADA_CODEX_COMMAND: 'codex-one',
      NARADA_CODEX_CLI_VERSION: '1.0.0',
    },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    userSiteRoot,
    dryRun: false,
    now: () => 1000,
    spawnSync(command, args, spawnOptions) {
      calls.push({ command, args, options: spawnOptions });
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    progressStream: { write() {} },
  };
  mkdirSync(options.processEnv.NARADA_CODEX_AUTH_HOME, { recursive: true });
  try {
    const first = codexSupport.codexSubscriptionPreflight('codex-subscription', options);
    const second = codexSupport.codexSubscriptionPreflight('codex-subscription', {
      ...options,
      processEnv: {
        ...options.processEnv,
        NARADA_CODEX_COMMAND: 'codex-two',
        NARADA_CODEX_CLI_VERSION: '2.0.0',
      },
      now: () => 2000,
    });
    assert.equal(first.status, 'passed_fresh');
    assert.equal(second.status, 'passed_fresh');
    assert.equal(calls.length, 2);
    assert.equal(second.cache.status, 'miss');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
    rmSync(userSiteRoot, { recursive: true, force: true });
  }
});

test('codex subscription support refuses cached readiness when auth home disappears', () => {
  const calls = [];
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-auth-missing-'));
  const userSiteRoot = mkdtempSync(join(tmpdir(), 'narada-user-site-codex-preflight-auth-missing-'));
  const authHome = join(userSiteRoot, '.codex-auth');
  const options = {
    processEnv: {
      USERPROFILE: 'C:/Users/Andrey',
      NARADA_CODEX_AUTH_HOME: authHome,
      NARADA_CODEX_COMMAND: 'codex',
      NARADA_CODEX_CLI_VERSION: '1.0.0',
    },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    userSiteRoot,
    dryRun: false,
    now: () => 1000,
    spawnSync(command, args, spawnOptions) {
      calls.push({ command, args, options: spawnOptions });
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    progressStream: { write() {} },
  };
  mkdirSync(authHome, { recursive: true });
  try {
    const first = codexSupport.codexSubscriptionPreflight('codex-subscription', options);
    rmSync(authHome, { recursive: true, force: true });
    const second = codexSupport.codexSubscriptionPreflight('codex-subscription', {
      ...options,
      now: () => 2000,
      spawnSync() {
        calls.push('second-spawn');
        return { status: 1, stdout: '', stderr: 'missing auth', signal: null, error: null };
      },
    });
    assert.equal(first.status, 'passed_fresh');
    assert.equal(second.status, 'failed_missing_auth_home');
    assert.equal(second.ok, false);
    assert.equal(calls.length, 1);
    assert.equal(second.cache.status, 'auth_missing');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
    rmSync(userSiteRoot, { recursive: true, force: true });
  }
});

test('codex subscription credential projection fails closed when launch preflight fails', () => {
  const resolution = providerResolution.resolveIntelligenceProviderLaunch('codex-subscription', 'agent-cli', { source_field: 'cli_argument' }, {
    metadataByProvider,
    admittedProviders,
    defaultProvider: providerRegistry.default_provider,
    schema: providerResolution.INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
  });
  const projected = providerCredentials.intelligenceProviderEnvironmentProjection(resolution, {
    metadataByProvider,
    processEnv: {},
    codexSubscriptionPreflight: () => ({
      schema: 'narada.codex_subscription.preflight.v1',
      status: 'failed_unauthorized',
      ok: false,
      provider: 'codex-subscription',
      command: 'codex exec --json',
      unauthorized: true,
    }),
  });
  assert.equal(projected.credential.credential_required, true);
  assert.equal(projected.credential.credential_present, false);
  assert.equal(projected.credential.credential_source, 'failed_unauthorized');
  const refusal = providerCredentials.providerCredentialRefusal(resolution, projected.credential, {
    schema: providerResolution.INTELLIGENCE_PROVIDER_CONTRACT_SCHEMA,
    withResolutionStates: (packet, states) => ({ ...packet, resolution_states: states }),
  });
  assert.equal(refusal.reason_code, 'local_codex_subscription_auth_unavailable');
  assert.match(refusal.required_next_step, /NARADA_CODEX_SUBSCRIPTION_PREFLIGHT=defer/);
});
