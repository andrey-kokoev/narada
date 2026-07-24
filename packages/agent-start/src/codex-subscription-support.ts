import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, delimiter, join, resolve } from 'node:path';
import { runAiProcessInvocationSync } from '@narada2/carrier-provider-support/ai-process-invocation';
import { codexAuthHome as sharedCodexAuthHome } from '@narada2/carrier-provider-support/codex-subscription-auth';
import { codexCommand } from '@narada2/carrier-provider-support/codex-subscription-command';
import { runHiddenPostureCommandSync } from '@narada2/process-launch-posture';

function defaultSpawnSync(command, args, options) {
  return runHiddenPostureCommandSync(command, args, { ...options, posture: 'provider_subprocess' });
}

export const CODEX_SUBSCRIPTION_PREFLIGHT_ENV = 'NARADA_CODEX_SUBSCRIPTION_PREFLIGHT';
export const CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS = 60000;
export const CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS = 15 * 60 * 1000;
export const CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_ENV = 'NARADA_CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS';
export const CODEX_SUBSCRIPTION_PREFLIGHT_REFRESH_VALUES = Object.freeze(['force', 'refresh', 'refetch']);

export function codexSubscriptionPreflightForced(processEnv = process.env) {
  const mode = String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_ENV] ?? '').trim().toLowerCase();
  return CODEX_SUBSCRIPTION_PREFLIGHT_REFRESH_VALUES.includes(mode);
}

export function codexSubscriptionPreflightDeferred(processEnv = process.env) {
  const mode = String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_ENV] ?? '').trim().toLowerCase();
  return ['defer', 'deferred', 'skip'].includes(mode);
}

export function codexPreflightCommand(processEnv = process.env, processPlatform = process.platform) {
  return codexCommand({ processEnv, platform: processPlatform, exists: existsSync });
}
export function codexAuthHome(processEnv = process.env) {
  return sharedCodexAuthHome({ processEnv });
}

export function codexSubscriptionPreflightEnv(processEnv = process.env) {
  const env = { ...processEnv };
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_BASE_URL;
  delete env.OPENAI_MODEL;
  const authHome = codexAuthHome(processEnv);
  if (authHome && !env.NARADA_CODEX_AUTH_HOME) env.NARADA_CODEX_AUTH_HOME = authHome;
  return env;
}

export function codexSubscriptionPreflight(provider, {
  processEnv = process.env,
  processPlatform = process.platform,
  sessionSiteRoot,
  siteId,
  runtimeSessionId,
  agentIdentityRef,
  launchSessionId,
  userSiteRoot,
  dryRun = false,
  spawnSync = defaultSpawnSync,
  now = Date.now,
  progressStream = process.stderr,
} = {}) {
  const mode = String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_ENV] ?? '').trim().toLowerCase();
  const authHome = codexAuthHome(processEnv);
  const authHomeExists = codexSubscriptionAuthAvailable(processEnv);
  const refreshRequested = codexSubscriptionPreflightForced(processEnv);
  if (dryRun || codexSubscriptionPreflightDeferred(processEnv)) {
    const status = dryRun
      ? 'deferred_for_dry_run'
      : 'deferred_by_operator_policy';
    return {
      schema: 'narada.codex_subscription.preflight.v1',
      status,
      ok: true,
      provider,
      command: 'codex exec --json',
      mode: mode || 'default',
      environment_variable: CODEX_SUBSCRIPTION_PREFLIGHT_ENV,
      reason: dryRun
        ? 'Dry-run validates launch shape without making a provider call.'
        : 'Launch-time local Codex subscription auth validation was explicitly deferred by NARADA_CODEX_SUBSCRIPTION_PREFLIGHT.',
    };
  }
  if (!runtimeSessionId) {
    return {
      schema: 'narada.codex_subscription.preflight.v1',
      status: 'failed_invocation_scope_missing',
      ok: false,
      provider,
      command: 'codex exec --json',
      mode: mode || 'default',
      environment_variable: CODEX_SUBSCRIPTION_PREFLIGHT_ENV,
      ai_process_invocation: {
        schema: 'narada.ai_process_invocation.v2',
        event: 'refusal',
        lifecycle_state: 'refused',
        reason: 'invocation_scope_missing',
      },
      reason: 'Codex subscription preflight requires the canonical NARS runtime-session scope before it may spawn a provider process.',
      required_next_step: 'Start the provider preflight from a registered NARS runtime session.',
    };
  }
  const command = codexPreflightCommand(processEnv, processPlatform);
  const cacheKey = codexSubscriptionPreflightCacheKey({ provider, processEnv, command });
  let cacheContext = { status: refreshRequested ? 'refresh_requested' : 'miss' };
  if (authHomeExists) {
    const cached = codexSubscriptionPreflightCacheRead({ userSiteRoot, cacheKey, now: now(), processEnv, authHome });
    if (!refreshRequested && cached?.status === 'passed_cached') return cached;
    if (cached?.cache && cacheContext.status !== 'refresh_requested') cacheContext = cached.cache;
  } else {
    cacheContext.status = 'auth_missing';
    cacheContext.auth_home = authHome;
  }
  if (!authHomeExists) {
    return {
      schema: 'narada.codex_subscription.preflight.v1',
      status: 'failed_missing_auth_home',
      ok: false,
      provider,
      command: `${command.command} ${[...command.prefixArgs, 'exec', '--json'].join(' ')}`,
      mode: mode || 'default',
      environment_variable: CODEX_SUBSCRIPTION_PREFLIGHT_ENV,
      cache: cacheContext,
      reason: 'The local Codex auth home is missing, so readiness cannot be cached or confirmed.',
      required_next_step: 'Run codex login or restore the local Codex auth home, then retry the launcher.',
    };
  }
  progressStream?.write?.(`Checking ${provider} local Codex subscription auth...\n`);
  const prompt = 'Return exactly: ok';
  const argv = [...command.prefixArgs, 'exec', '--json', prompt];
  const env = codexSubscriptionPreflightEnv(processEnv);
  const result = runAiProcessInvocationSync({
    adapterKind: 'codex',
    projection: 'codex-subscription',
    purpose: 'auth_probe',
    siteRoot: sessionSiteRoot,
    cwd: sessionSiteRoot,
    command: command.command,
    argv,
    env,
    invocationScope: {
      schema: 'narada.ai_process_invocation_scope.v1',
      kind: 'narada_runtime_session',
      site_id: siteId ?? processEnv.NARADA_SITE_ID ?? null,
      site_root: sessionSiteRoot,
      runtime_session_id: runtimeSessionId,
      agent_identity_ref: agentIdentityRef ?? null,
      launch_session_id: launchSessionId ?? null,
    },
  }, {
    spawnSync,
    spawnOptions: {
      cwd: sessionSiteRoot,
      encoding: 'utf8',
      timeout: CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS,
      windowsHide: true,
      // This probe is deliberately non-interactive. Send an empty input
      // frame through a pipe so Node closes stdin deterministically; Codex
      // otherwise waits for another prompt and consumes the full timeout.
      stdio: ['pipe', 'pipe', 'pipe'],
      input: '',
      env,
    },
  });
  const stdout = String(result.stdout ?? '');
  const stderrText = String(result.stderr ?? '');
  const combined = `${stdout}\n${stderrText}`;
  const unauthorized = /401\s+Unauthorized|Unauthorized/i.test(combined);
  const preflight = {
    schema: 'narada.codex_subscription.preflight.v1',
    status: result.status === 0 ? 'passed_fresh' : unauthorized ? 'failed_unauthorized' : 'failed',
    ok: result.status === 0,
    provider,
    command: `${command.command} ${[...command.prefixArgs, 'exec', '--json'].join(' ')}`,
    exit_code: result.status,
    signal: result.signal,
    error: result.error ? result.error.message : null,
    unauthorized,
    stdout_first_line: stdout.split(/\r?\n/).find((line) => line.trim()) ?? '',
    stderr_first_line: stderrText.split(/\r?\n/).find((line) => line.trim()) ?? '',
    timeout_ms: CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS,
    ai_process_invocation: result.aiProcessInvocation ?? null,
    cache: {
      status: refreshRequested ? 'refresh_requested' : cacheContext.status,
      auth_home: authHome,
      auth_home_exists: authHomeExists,
      cli_version: codexSubscriptionCliVersion(processEnv),
      command_identity: codexSubscriptionCommandIdentity(command, processEnv),
      path: codexSubscriptionPreflightCachePath({ userSiteRoot }),
    },
  };
  if (preflight.ok) codexSubscriptionPreflightCacheWrite({ userSiteRoot, sessionSiteRoot, cacheKey, preflight, now: now(), processEnv });
  return preflight;
}

function codexSubscriptionPreflightCacheTtlMs(processEnv = process.env) {
  const configured = Number.parseInt(String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_ENV] ?? ''), 10);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS;
}

function codexSubscriptionCliVersion(processEnv = process.env) {
  return optionalEnvironmentValue('NARADA_CODEX_CLI_VERSION', processEnv)
    ?? optionalEnvironmentValue('CODEX_CLI_VERSION', processEnv)
    ?? optionalEnvironmentValue('CODEX_VERSION', processEnv)
    ?? null;
}

function codexSubscriptionAuthAvailable(processEnv = process.env) {
  const authHome = codexAuthHome(processEnv);
  return Boolean(authHome && existsSync(authHome));
}

function codexSubscriptionCommandIdentity(command, processEnv = process.env) {
  return [
    command.command,
    command.source ?? 'default',
    ...(command.prefixArgs ?? []),
    codexSubscriptionCliVersion(processEnv) ?? '',
  ].join('\u0000');
}

function codexSubscriptionPreflightCachePath({ userSiteRoot }) {
  if (!userSiteRoot) return null;
  return join(siteControlRoot(userSiteRoot), 'runtime', 'provider-auth-cache', 'codex-subscription-preflight-cache.json');
}

function siteControlRoot(siteRoot) {
  const root = resolve(siteRoot);
  return basename(root).toLowerCase() === '.narada' ? root : join(root, '.narada');
}

function codexSubscriptionPreflightCacheKey({ provider, processEnv, command }) {
  return [
    provider,
    command.command,
    command.source ?? '',
    ...(command.prefixArgs ?? []),
    codexAuthHome(processEnv) ?? '',
    codexSubscriptionCliVersion(processEnv) ?? '',
  ].join('\u0000');
}

function codexSubscriptionPreflightCacheRead({ userSiteRoot, cacheKey, now, processEnv, authHome }) {
  const ttlMs = codexSubscriptionPreflightCacheTtlMs(processEnv);
  if (ttlMs <= 0) return null;
  const cachePath = codexSubscriptionPreflightCachePath({ userSiteRoot });
  if (!cachePath || !existsSync(cachePath)) return null;
  try {
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    const entry = cache.entries?.[cacheKey];
    if (!entry) return null;
    if (!entry.ok || !entry.checked_at_ms) return { cache: { status: 'stale', path: cachePath, ttl_ms: ttlMs } };
    if (now - entry.checked_at_ms > ttlMs) {
      return {
        cache: {
          status: 'stale',
          path: cachePath,
          ttl_ms: ttlMs,
          age_ms: now - entry.checked_at_ms,
        },
      };
    }
    if (authHome && !existsSync(authHome)) {
      return {
        cache: {
          status: 'auth_missing',
          path: cachePath,
          ttl_ms: ttlMs,
          auth_home: authHome,
        },
      };
    }
    return {
      schema: 'narada.codex_subscription.preflight.v1',
      status: 'passed_cached',
      ok: true,
      provider: entry.provider ?? 'codex-subscription',
      command: entry.command ?? 'codex exec --json',
      cache: {
        status: 'hit',
        locus: 'user-site',
        checked_at: entry.checked_at ?? null,
        age_ms: now - entry.checked_at_ms,
        ttl_ms: ttlMs,
        path: cachePath,
        auth_home: entry.auth_home ?? authHome ?? null,
        cli_version: entry.cli_version ?? codexSubscriptionCliVersion(processEnv),
        command_identity: entry.command_identity ?? codexSubscriptionCommandIdentity({ command: entry.command?.split?.(' ')?.[0] ?? 'codex', source: entry.command_source ?? 'default', prefixArgs: entry.prefix_args ?? [] }, processEnv),
      },
      timeout_ms: CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS,
    };
  } catch {
    return null;
  }
}

function codexSubscriptionPreflightCacheWrite({ userSiteRoot, sessionSiteRoot, cacheKey, preflight, now, processEnv }) {
  const ttlMs = codexSubscriptionPreflightCacheTtlMs(processEnv);
  if (ttlMs <= 0) return;
  const cachePath = codexSubscriptionPreflightCachePath({ userSiteRoot });
  if (!cachePath) return;
  try {
    const cacheDir = join(siteControlRoot(userSiteRoot), 'runtime', 'provider-auth-cache');
    mkdirSync(cacheDir, { recursive: true });
    let cache = { schema: 'narada.codex_subscription.preflight_cache.v1', entries: {} };
    if (existsSync(cachePath)) {
      try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { /* replace invalid cache */ }
      if (!cache || typeof cache !== 'object') cache = { schema: 'narada.codex_subscription.preflight_cache.v1', entries: {} };
      if (!cache.entries || typeof cache.entries !== 'object') cache.entries = {};
    }
    cache.entries[cacheKey] = {
      ok: true,
      provider: preflight.provider,
      command: preflight.command,
      command_identity: preflight.cache?.command_identity ?? codexSubscriptionCommandIdentity({ command: preflight.command?.split?.(' ')?.[0] ?? 'codex', source: 'live', prefixArgs: [] }, processEnv),
      command_source: preflight.cache?.command_identity ? 'cached' : 'live',
      prefix_args: preflight.cache?.command_identity ? [] : [...(preflight.cache?.prefix_args ?? [])],
      auth_home: preflight.cache?.auth_home ?? codexAuthHome(processEnv) ?? null,
      cli_version: preflight.cache?.cli_version ?? codexSubscriptionCliVersion(processEnv) ?? null,
      checked_at: new Date(now).toISOString(),
      checked_at_ms: now,
    };
    writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  } catch {
    // Cache failures must not block launch; the live preflight already succeeded.
  }
}

export function codexContextIsolationStatus({ exec = false, dryRun = false } = {}) {
  return {
    status: exec && !dryRun ? 'fresh_launcher_bound' : 'fresh_launch_planned',
    code: exec && !dryRun ? 'codex_fresh_launcher_bound' : 'codex_fresh_launch_planned',
    runtime: 'codex',
    runtime_substrate_kind: 'codex',
    reason: 'Narada can start a fresh Codex runtime with a bound agent identity and MCP-only posture. Exact resume proof remains a separate unadmitted boundary.',
    operator_message: 'Use launcher-started fresh Codex sessions for bound identity. Do not use codex resume --last, ambient picker selection, or manual session selection as authority.',
    safe_action: 'For continuation, resume only by an exact Codex session id after Narada has admitted and verified that session evidence.',
    forbidden_resume_modes: ['codex resume --last', 'ambient picker selection', 'manual session selection as authority'],
  };
}

function optionalEnvironmentValue(name, processEnv = process.env) {
  const value = processEnv[name];
  return value === undefined || value === '' ? null : value;
}

function pathDirectories(processEnv = process.env) {
  const pathValue = processEnv.PATH ?? processEnv.Path ?? '';
  return pathValue.split(delimiter).filter((entry) => entry.length > 0);
}

export function resolveCodexCliScriptFromPackage(requireLike, exists = existsSync) {
  const candidates = [
    '@openai/codex/bin/codex.js',
    '@openai/codex/bin/codex',
  ];
  for (const candidate of candidates) {
    try {
      const resolved = requireLike.resolve(candidate);
      if (exists(resolved)) return resolved;
    } catch {
      // Try the next known package entrypoint shape.
    }
  }
  return null;
}

export function resolveCodexCliScriptFromPath({ processEnv = process.env, exists = existsSync } = {}) {
  for (const directory of pathDirectories(processEnv)) {
    const adjacentPackageScript = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (exists(adjacentPackageScript)) return adjacentPackageScript;
  }
  return null;
}

export function resolveCodexCliScriptPath({ processEnv = process.env, requireLike, exists = existsSync } = {}) {
  const explicitScriptPath = optionalEnvironmentValue('NARADA_CODEX_CLI_SCRIPT', processEnv);
  if (explicitScriptPath !== null) {
    if (!exists(explicitScriptPath)) {
      throw new Error(`codex_cli_script_missing: ${explicitScriptPath}`);
    }
    return explicitScriptPath;
  }

  const resolvedScriptPath = resolveCodexCliScriptFromPackage(requireLike, exists) ?? resolveCodexCliScriptFromPath({ processEnv, exists });
  if (resolvedScriptPath !== null) return resolvedScriptPath;

  throw new Error('codex_cli_script_unresolved: set NARADA_CODEX_CLI_SCRIPT or install @openai/codex on PATH');
}
