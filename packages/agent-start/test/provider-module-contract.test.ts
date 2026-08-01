import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname: any = dirname(fileURLToPath(import.meta.url));
const packageRoot: any = resolve(__dirname, '..');
const naradaProperRoot: any = resolve(packageRoot, '..', '..');

const codexSupport: any = await import(pathToFileURL(resolve(packageRoot, 'src', 'codex-subscription-support.ts')).href);
const aiProcessInvocation: any = await import('@narada-core/carrier-provider-support/ai-process-invocation');

test('codex subscription support defers dry-run auth and scrubs OpenAI API env', () => {
  const processEnv: any = {
    OPENAI_API_KEY: 'stale-api-key',
    OPENAI_BASE_URL: 'https://stale.example',
    OPENAI_MODEL: 'stale-model',
    USERPROFILE: 'C:/Users/Andrey',
  };
  const preflight: any = codexSupport.codexSubscriptionPreflight('codex-subscription', {
    processEnv,
    sessionSiteRoot: naradaProperRoot,
    dryRun: true,
  });
  assert.equal(preflight.status, 'deferred_for_dry_run');
  assert.equal(preflight.ok, true);
  const env: any = codexSupport.codexSubscriptionPreflightEnv(processEnv);
  assert.equal(Object.hasOwn(env, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'OPENAI_BASE_URL'), false);
  assert.equal(Object.hasOwn(env, 'OPENAI_MODEL'), false);
  assert.equal(normalize(env.NARADA_CODEX_AUTH_HOME), normalize('C:/Users/Andrey/.codex'));
});

test('codex subscription support runs live auth preflight for non-dry launch by default', () => {
  const calls: any = [];
  const siteRoot: any = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-live-'));
  const preflight: any = codexSupport.codexSubscriptionPreflight('codex-subscription', {
    processEnv: { USERPROFILE: 'C:/Users/Andrey' },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    runtimeSessionId: 'preflight-test-session',
    dryRun: false,
    spawnSync(command: any, args: any, options) : any{
      calls.push({ command, args, options });
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    stderr: { write() : any{} },
  });
  try {
    assert.equal(preflight.status, 'passed_fresh');
    assert.equal(preflight.ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args.slice(-3, -1), ['exec', '--json']);
    assert.deepEqual(calls[0].options.stdio, ['pipe', 'pipe', 'pipe']);
    assert.equal(calls[0].options.input, '');
    assert.equal(Object.hasOwn(calls[0].options.env, 'OPENAI_API_KEY'), false);
    assert.equal(preflight.ai_process_invocation.event, 'release');
    assert.equal(preflight.ai_process_invocation.lifecycle_state, 'released');
    assert.deepEqual(
      preflight.ai_process_invocation.lifecycle_history.map((entry: any) => entry.state),
      ['admitted', 'spawned', 'exited', 'released'],
    );
    assert.equal(preflight.ai_process_invocation.projection, 'codex-subscription');
    assert.equal(preflight.ai_process_invocation.purpose, 'auth_probe');
    assert.equal(preflight.ai_process_invocation.adapter_kind, 'codex');
    assert.equal(preflight.ai_process_invocation.invocation_scope.kind, 'narada_runtime_session');
    assert.equal(preflight.ai_process_invocation.invocation_scope.runtime_session_id, 'preflight-test-session');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('codex subscription preflight fails closed without a NARS runtime-session scope', () => {
  const siteRoot: any = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-scope-missing-'));
  let called: any = false;
  try {
    const preflight: any = codexSupport.codexSubscriptionPreflight('codex-subscription', {
      processEnv: { USERPROFILE: 'C:/Users/Andrey' },
      processPlatform: 'linux',
      sessionSiteRoot: siteRoot,
      dryRun: false,
      spawnSync() : any{
        called = true;
        return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
      },
    });
    assert.equal(preflight.status, 'failed_invocation_scope_missing');
    assert.equal(preflight.ok, false);
    assert.equal(preflight.ai_process_invocation.reason, 'invocation_scope_missing');
    assert.equal(called, false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('codex subscription preflight refuses duplicate AiProcessInvocation before spawnSync', () => {
  const siteRoot: any = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-duplicate-'));
  const processEnv: any = {
    USERPROFILE: 'C:/Users/Andrey',
    CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS: '0',
  };
  const command: any = codexSupport.codexPreflightCommand(processEnv, 'linux');
  const argv: any = [...command.prefixArgs, 'exec', '--json', 'Return exactly: ok'];
  const env: any = codexSupport.codexSubscriptionPreflightEnv(processEnv);
  const first: any = aiProcessInvocation.admitAiProcessInvocation({
    adapterKind: 'codex',
    projection: 'codex-subscription',
    purpose: 'auth_probe',
    siteRoot,
    cwd: siteRoot,
    command: command.command,
    argv,
    env,
    invocationScope: {
      kind: 'narada_runtime_session',
      site_root: siteRoot,
      runtime_session_id: 'preflight-test-session',
    },
  }, { ownerPid: process.pid });
  let called: any = false;
  try {
    const preflight: any = codexSupport.codexSubscriptionPreflight('codex-subscription', {
      processEnv,
      processPlatform: 'linux',
      sessionSiteRoot: siteRoot,
      runtimeSessionId: 'preflight-test-session',
      dryRun: false,
      spawnSync() : any{
        called = true;
        return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
      },
      stderr: { write() : any{} },
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
  const calls: any = [];
  const progress: any = [];
  const siteRoot: any = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-cache-'));
  const userSiteRoot: any = mkdtempSync(join(tmpdir(), 'narada-user-site-codex-preflight-cache-'));
  const options: any = {
    processEnv: { USERPROFILE: 'C:/Users/Andrey', CODEX_MODEL: 'gpt-5.5' },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    runtimeSessionId: 'preflight-test-session',
    userSiteRoot,
    dryRun: false,
    now: () => 1000,
    spawnSync(command: any, args: any, spawnOptions) : any{
      calls.push({ command, args, options: spawnOptions });
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    progressStream: { write: (line: any) => progress.push(line) },
  };
  try {
    const first: any = codexSupport.codexSubscriptionPreflight('codex-subscription', options);
    const second: any = codexSupport.codexSubscriptionPreflight('codex-subscription', { ...options, now: () => 2000 });
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
  const calls: any = [];
  const siteRoot: any = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-force-'));
  const baseOptions: any = {
    processEnv: { USERPROFILE: 'C:/Users/Andrey' },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    runtimeSessionId: 'preflight-test-session',
    dryRun: false,
    now: () => 1000,
    spawnSync() : any{
      calls.push('spawn');
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    progressStream: { write() : any{} },
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
  const calls: any = [];
  const siteRoot: any = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-command-'));
  const userSiteRoot: any = mkdtempSync(join(tmpdir(), 'narada-user-site-codex-preflight-command-'));
  const options: any = {
    processEnv: {
      USERPROFILE: 'C:/Users/Andrey',
      NARADA_CODEX_AUTH_HOME: join(userSiteRoot, '.codex-auth'),
      NARADA_CODEX_COMMAND: 'codex-one',
      NARADA_CODEX_CLI_VERSION: '1.0.0',
    },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    runtimeSessionId: 'preflight-test-session',
    userSiteRoot,
    dryRun: false,
    now: () => 1000,
    spawnSync(command: any, args: any, spawnOptions) : any{
      calls.push({ command, args, options: spawnOptions });
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    progressStream: { write() : any{} },
  };
  mkdirSync(options.processEnv.NARADA_CODEX_AUTH_HOME, { recursive: true });
  try {
    const first: any = codexSupport.codexSubscriptionPreflight('codex-subscription', options);
    const second: any = codexSupport.codexSubscriptionPreflight('codex-subscription', {
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
  const calls: any = [];
  const siteRoot: any = mkdtempSync(join(tmpdir(), 'narada-codex-preflight-auth-missing-'));
  const userSiteRoot: any = mkdtempSync(join(tmpdir(), 'narada-user-site-codex-preflight-auth-missing-'));
  const authHome: any = join(userSiteRoot, '.codex-auth');
  const options: any = {
    processEnv: {
      USERPROFILE: 'C:/Users/Andrey',
      NARADA_CODEX_AUTH_HOME: authHome,
      NARADA_CODEX_COMMAND: 'codex',
      NARADA_CODEX_CLI_VERSION: '1.0.0',
    },
    processPlatform: 'linux',
    sessionSiteRoot: siteRoot,
    runtimeSessionId: 'preflight-test-session',
    userSiteRoot,
    dryRun: false,
    now: () => 1000,
    spawnSync(command: any, args: any, spawnOptions) : any{
      calls.push({ command, args, options: spawnOptions });
      return { status: 0, stdout: '{"event":"ok"}\n', stderr: '', signal: null, error: null };
    },
    progressStream: { write() : any{} },
  };
  mkdirSync(authHome, { recursive: true });
  try {
    const first: any = codexSupport.codexSubscriptionPreflight('codex-subscription', options);
    rmSync(authHome, { recursive: true, force: true });
    const second: any = codexSupport.codexSubscriptionPreflight('codex-subscription', {
      ...options,
      now: () => 2000,
      spawnSync() : any{
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

