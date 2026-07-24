import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { codexAuthHome } from './codex-subscription-auth.mjs';
import { codexCommand } from './codex-subscription-command.mjs';
import { runAiProcessInvocationSync } from './ai-process-invocation.mjs';

export const CODEX_SUBSCRIPTION_READINESS_CACHE_TTL_MS = 15 * 60 * 1000;
export const CODEX_SUBSCRIPTION_READINESS_CACHE_TTL_ENV = 'NARADA_CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS';

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalEnvironmentValue(name, processEnv = process.env) {
  const value = processEnv?.[name];
  return value === undefined || value === '' ? null : String(value);
}

function optionalModel(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.trim()) return value.id.trim();
  return null;
}

function selectedModel(model, processEnv = process.env) {
  return optionalModel(model)
    ?? optionalEnvironmentValue('NARADA_AI_MODEL', processEnv)
    ?? optionalEnvironmentValue('CODEX_MODEL', processEnv);
}

const CODEX_REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);

function selectedReasoningEffort(thinking, processEnv = process.env) {
  const candidate = (typeof thinking === 'string' ? thinking : null)
    ?? optionalEnvironmentValue('NARADA_AI_THINKING', processEnv)
    ?? optionalEnvironmentValue('CODEX_REASONING_EFFORT', processEnv)
    ?? optionalEnvironmentValue('CODEX_THINKING', processEnv)
    ?? null;
  const normalized = candidate?.trim().toLowerCase() ?? '';
  return CODEX_REASONING_EFFORTS.has(normalized) ? normalized : 'medium';
}

function probeArguments({ command, model, reasoningEffort }) {
  const args = [
    ...(command.prefixArgs ?? []),
    'exec',
    '--json',
    '--ephemeral',
    '--ignore-user-config',
  ];
  if (model) args.push('--model', model);
  args.push('-c', `model_reasoning_effort="${reasoningEffort}"`, 'Return exactly: ok');
  return args;
}

function structuredProbeCompletion(stdout) {
  let turnCompleted = false;
  let turnFailed = false;
  let assistantMessage = false;
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'turn.completed') turnCompleted = true;
      if (event.type === 'turn.failed' || event.type === 'error') turnFailed = true;
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') assistantMessage = true;
    } catch {
      // The probe only treats complete, parseable Codex JSONL as completion evidence.
    }
  }
  return {
    observed: turnCompleted && assistantMessage && !turnFailed,
    turn_completed: turnCompleted,
    assistant_message: assistantMessage,
    turn_failed: turnFailed,
  };
}

function siteControlRoot(siteRoot) {
  const root = resolve(siteRoot);
  return basename(root).toLowerCase() === '.narada' ? root : join(root, '.narada');
}

function cacheTtlMs(processEnv = process.env) {
  const configured = Number.parseInt(String(processEnv[CODEX_SUBSCRIPTION_READINESS_CACHE_TTL_ENV] ?? ''), 10);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : CODEX_SUBSCRIPTION_READINESS_CACHE_TTL_MS;
}

function cliVersion(processEnv = process.env) {
  return optionalEnvironmentValue('NARADA_CODEX_CLI_VERSION', processEnv)
    ?? optionalEnvironmentValue('CODEX_CLI_VERSION', processEnv)
    ?? optionalEnvironmentValue('CODEX_VERSION', processEnv)
    ?? null;
}

function commandIdentity(command, processEnv = process.env) {
  return [
    command.command,
    command.source ?? 'default',
    ...(command.prefixArgs ?? []),
    cliVersion(processEnv) ?? '',
  ].join('\u0000');
}

export function codexSubscriptionReadinessCachePath({ userSiteRoot } = {}) {
  if (!optionalString(userSiteRoot)) return null;
  return join(siteControlRoot(userSiteRoot), 'runtime', 'provider-auth-cache', 'codex-subscription-preflight-cache.json');
}

export function deriveUserSiteRootFromRegistryPath(registryDbPath) {
  const path = optionalString(registryDbPath);
  if (!path || path === ':memory:') return null;
  const resolved = resolve(path);
  return basename(dirname(resolved)).toLowerCase() === '.ai'
    ? dirname(dirname(resolved))
    : null;
}

export function codexSubscriptionReadinessCacheKey({
  provider = 'codex-subscription',
  processEnv = process.env,
  command = codexCommand({ processEnv }),
  model = null,
  thinking = null,
} = {}) {
  return [
    provider,
    command.command,
    command.source ?? '',
    ...(command.prefixArgs ?? []),
    codexAuthHome({ processEnv }) ?? '',
    cliVersion(processEnv) ?? '',
    selectedModel(model, processEnv) ?? '',
    selectedReasoningEffort(thinking, processEnv),
  ].join('\u0000');
}

function sanitizedEnvironment(processEnv, authHome) {
  const env = { ...processEnv };
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_BASE_URL;
  delete env.OPENAI_MODEL;
  if (authHome) {
    env.NARADA_CODEX_AUTH_HOME = authHome;
    env.CODEX_HOME = authHome;
  }
  return env;
}

function baseEvidence({ session, authorityRef, status, evidenceRef, observedAt, probe }) {
  return {
    schema: 'narada.invokable-intelligence.local-runtime-service-evidence.v1',
    service: 'codex-subscription',
    runtime_family: 'node',
    protocol_family: 'codex-subscription',
    status,
    observed_for_session: session,
    authority_ref: authorityRef,
    observed_at: observedAt,
    evidence_class: 'observed',
    evidence_ref: evidenceRef,
    probe,
  };
}

function cacheRead({ userSiteRoot, cacheKey, now, processEnv, authHome, session, authorityRef }) {
  const ttlMs = cacheTtlMs(processEnv);
  const cachePath = codexSubscriptionReadinessCachePath({ userSiteRoot });
  if (ttlMs <= 0 || !cachePath || !existsSync(cachePath)) return null;
  try {
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    const entry = cache.entries?.[cacheKey];
    if (!entry?.ok || !Number.isFinite(entry.checked_at_ms)) return null;
    const ageMs = now - entry.checked_at_ms;
    if (ageMs < 0 || ageMs > ttlMs || (authHome && !existsSync(authHome))) return null;
    return baseEvidence({
      session,
      authorityRef,
      status: 'ready',
      evidenceRef: `local-runtime-service-cache:codex-subscription:${session}:${entry.checked_at_ms}`,
      observedAt: new Date(now).toISOString(),
      probe: {
        kind: 'authenticated-provider-preflight',
        source: 'user-site-cache',
        cache_status: 'hit',
        cache_path: cachePath,
        checked_at: entry.checked_at ?? null,
        age_ms: ageMs,
        ttl_ms: ttlMs,
        command_identity: entry.command_identity ?? null,
        model: entry.model ?? null,
        reasoning_effort: entry.reasoning_effort ?? null,
      },
    });
  } catch {
    return null;
  }
}

function cacheWrite({ userSiteRoot, cacheKey, preflight, now, processEnv, authHome, command, model, reasoningEffort }) {
  const ttlMs = cacheTtlMs(processEnv);
  const cachePath = codexSubscriptionReadinessCachePath({ userSiteRoot });
  if (ttlMs <= 0 || !cachePath) return;
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    let cache = { schema: 'narada.codex_subscription.preflight_cache.v1', entries: {} };
    if (existsSync(cachePath)) {
      try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { /* replace invalid cache */ }
    }
    if (!cache || typeof cache !== 'object') cache = { schema: 'narada.codex_subscription.preflight_cache.v1', entries: {} };
    if (!cache.entries || typeof cache.entries !== 'object') cache.entries = {};
    cache.entries[cacheKey] = {
      ok: true,
      provider: 'codex-subscription',
      command: `${command.command} ${[...(command.prefixArgs ?? []), 'exec', '--json'].join(' ')}`,
      command_identity: commandIdentity(command, processEnv),
      command_source: command.source ?? 'default',
      prefix_args: [...(command.prefixArgs ?? [])],
      auth_home: authHome ?? null,
      cli_version: cliVersion(processEnv),
      model: model ?? null,
      reasoning_effort: reasoningEffort,
      checked_at: new Date(now).toISOString(),
      checked_at_ms: now,
    };
    writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  } catch {
    // Readiness evidence remains valid when cache persistence is unavailable.
  }
}

export function probeCodexSubscriptionService({
  env = process.env,
  session = 'unknown',
  authorityRef = `runtime:${session}`,
  timeoutMs = 60000,
  now = Date.now,
  userSiteRoot = null,
  registryDbPath = null,
  sessionSiteRoot = null,
  siteId = null,
  agentIdentityRef = null,
  launchSessionId = null,
  model = null,
  thinking = null,
  runProbeSync = runAiProcessInvocationSync,
} = {}) {
  const command = codexCommand({ processEnv: env });
  const authHome = codexAuthHome({ processEnv: env });
  const probeModel = selectedModel(model, env);
  const reasoningEffort = selectedReasoningEffort(thinking, env);
  const effectiveUserSiteRoot = userSiteRoot ?? deriveUserSiteRootFromRegistryPath(registryDbPath ?? env.NARADA_INTELLIGENCE_REGISTRY_DB);
  const cacheKey = codexSubscriptionReadinessCacheKey({ processEnv: env, command, model: probeModel, thinking: reasoningEffort });
  const observedAt = new Date(now()).toISOString();
  const cached = cacheRead({
    userSiteRoot: effectiveUserSiteRoot,
    cacheKey,
    now: Date.parse(observedAt),
    processEnv: env,
    authHome,
    session,
    authorityRef,
  });
  if (cached) return cached;

  if (!authHome || !existsSync(authHome)) {
    return baseEvidence({
      session,
      authorityRef,
      status: 'unavailable',
      evidenceRef: `local-runtime-service-probe:codex-subscription:${session}:auth-home-missing`,
      observedAt,
      probe: {
        kind: 'authenticated-provider-preflight',
        source: 'live',
        reason_code: 'codex-auth-home-missing',
        auth_home: authHome,
      },
    });
  }

  const root = sessionSiteRoot ?? env.NARADA_SITE_ROOT ?? process.cwd();
  const invocationScope = {
    schema: 'narada.ai_process_invocation_scope.v1',
    kind: 'narada_runtime_session',
    site_id: siteId ?? env.NARADA_SITE_ID ?? null,
    site_root: root,
    runtime_session_id: session,
    agent_identity_ref: agentIdentityRef,
    launch_session_id: launchSessionId,
  };
  const argv = probeArguments({ command, model: probeModel, reasoningEffort });
  const result = runProbeSync({
    adapterKind: 'codex',
    projection: 'codex-subscription',
    purpose: 'auth_probe',
    siteRoot: root,
    cwd: root,
    command: command.command,
    argv,
    env: sanitizedEnvironment(env, authHome),
    invocationScope,
  }, {
    spawnOptions: {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      // Codex treats an open stdin as an additional prompt stream and waits
      // for EOF. A readiness probe is non-interactive: send an empty input
      // frame through a pipe so Node closes stdin deterministically.
      stdio: ['pipe', 'pipe', 'pipe'],
      input: '',
      env: sanitizedEnvironment(env, authHome),
    },
  });
  const stdout = String(result?.stdout ?? '');
  const stderr = String(result?.stderr ?? '');
  const completion = structuredProbeCompletion(stdout);
  const status = result?.status === 0 || completion.observed ? 'ready' : 'unavailable';
  const evidence = baseEvidence({
    session,
    authorityRef,
    status,
    evidenceRef: `local-runtime-service-probe:codex-subscription:${session}:${status}`,
    observedAt: new Date(now()).toISOString(),
    probe: {
      kind: 'authenticated-provider-preflight',
      source: 'live',
      command_source: command.source,
      command_identity: commandIdentity(command, env),
      model: probeModel,
      reasoning_effort: reasoningEffort,
      completion_observed: completion.observed,
      completion_evidence: completion,
      success_basis: result?.status === 0 ? 'process_exit_zero' : completion.observed ? 'structured_turn_completed' : 'none',
      exit_code: result?.status ?? null,
      signal: result?.signal ?? null,
      error: result?.error?.message ?? null,
      stdout_first_line: stdout.split(/\r?\n/).find((line) => line.trim()) ?? '',
      stderr_first_line: stderr.split(/\r?\n/).find((line) => line.trim()) ?? '',
      timeout_ms: timeoutMs,
      ai_process_invocation: result?.aiProcessInvocation ?? null,
    },
  });
  if (status === 'ready') {
    cacheWrite({
      userSiteRoot: effectiveUserSiteRoot,
      cacheKey,
      preflight: evidence,
      now: Date.parse(evidence.observed_at),
      processEnv: env,
      authHome,
      command,
      model: probeModel,
      reasoningEffort,
    });
  }
  return evidence;
}
