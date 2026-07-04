import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { runAiProcessInvocationSync } from '@narada2/carrier-provider-support/ai-process-invocation';
import { codexAuthHome as sharedCodexAuthHome } from '@narada2/carrier-provider-support/codex-subscription-auth';
import { codexCommand } from '@narada2/carrier-provider-support/codex-subscription-command';
import { spawnSync as defaultSpawnSync } from 'node:child_process';

export const CODEX_SUBSCRIPTION_PREFLIGHT_ENV = 'NARADA_CODEX_SUBSCRIPTION_PREFLIGHT';
export const CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS = 60000;
export const CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS = 15 * 60 * 1000;
export const CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_ENV = 'NARADA_CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS';

export function codexSubscriptionPreflightForced(processEnv = process.env) {
  const mode = String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_ENV] ?? '').trim().toLowerCase();
  return mode === 'force';
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
  userSiteRoot,
  dryRun = false,
  spawnSync = defaultSpawnSync,
  now = Date.now,
  progressStream = process.stderr,
} = {}) {
  const mode = String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_ENV] ?? '').trim().toLowerCase();
  const shouldRunLiveProbe = codexSubscriptionPreflightForced(processEnv) || (!dryRun && !codexSubscriptionPreflightDeferred(processEnv));
  if (!shouldRunLiveProbe) {
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
  const command = codexPreflightCommand(processEnv, processPlatform);
  const cacheKey = codexSubscriptionPreflightCacheKey({ provider, processEnv, command });
  const cached = codexSubscriptionPreflightCacheRead({ userSiteRoot, sessionSiteRoot, cacheKey, now: now(), processEnv });
  if (!codexSubscriptionPreflightForced(processEnv) && cached) return cached;
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
  }, {
    spawnSync,
    spawnOptions: {
      cwd: sessionSiteRoot,
      encoding: 'utf8',
      timeout: CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS,
      windowsHide: true,
      env,
    },
  });
  const stdout = String(result.stdout ?? '');
  const stderrText = String(result.stderr ?? '');
  const combined = `${stdout}\n${stderrText}`;
  const unauthorized = /401\s+Unauthorized|Unauthorized/i.test(combined);
  const preflight = {
    schema: 'narada.codex_subscription.preflight.v1',
    status: result.status === 0 ? 'passed' : unauthorized ? 'failed_unauthorized' : 'failed',
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
  };
  if (preflight.ok) codexSubscriptionPreflightCacheWrite({ userSiteRoot, sessionSiteRoot, cacheKey, preflight, now: now(), processEnv });
  return preflight;
}

function codexSubscriptionPreflightCacheTtlMs(processEnv = process.env) {
  const configured = Number.parseInt(String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_ENV] ?? ''), 10);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return CODEX_SUBSCRIPTION_PREFLIGHT_CACHE_TTL_MS;
}

function codexSubscriptionPreflightCacheRoot({ userSiteRoot, sessionSiteRoot }) {
  return userSiteRoot ?? sessionSiteRoot ?? null;
}

function codexSubscriptionPreflightCachePath({ userSiteRoot, sessionSiteRoot }) {
  const cacheRoot = codexSubscriptionPreflightCacheRoot({ userSiteRoot, sessionSiteRoot });
  if (!cacheRoot) return null;
  if (userSiteRoot) return join(cacheRoot, '.narada', 'runtime', 'provider-auth-cache', 'codex-subscription-preflight-cache.json');
  return join(cacheRoot, '.ai', 'runtime', 'codex-subscription-preflight-cache.json');
}

function codexSubscriptionPreflightCacheKey({ provider, processEnv, command }) {
  return [
    provider,
    command.command,
    ...(command.prefixArgs ?? []),
    codexAuthHome(processEnv) ?? '',
    processEnv.CODEX_MODEL ?? '',
  ].join('\u0000');
}

function codexSubscriptionPreflightCacheRead({ userSiteRoot, sessionSiteRoot, cacheKey, now, processEnv }) {
  const ttlMs = codexSubscriptionPreflightCacheTtlMs(processEnv);
  if (ttlMs <= 0) return null;
  const cachePath = codexSubscriptionPreflightCachePath({ userSiteRoot, sessionSiteRoot });
  if (!cachePath || !existsSync(cachePath)) return null;
  try {
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    const entry = cache.entries?.[cacheKey];
    if (!entry?.ok || !entry.checked_at_ms || now - entry.checked_at_ms > ttlMs) return null;
    return {
      schema: 'narada.codex_subscription.preflight.v1',
      status: 'passed_cached',
      ok: true,
      provider: entry.provider ?? 'codex-subscription',
      command: entry.command ?? 'codex exec --json',
      cache: {
        status: 'hit',
        locus: userSiteRoot ? 'user-site' : 'session-site',
        checked_at: entry.checked_at ?? null,
        age_ms: now - entry.checked_at_ms,
        ttl_ms: ttlMs,
        path: cachePath,
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
  const cachePath = codexSubscriptionPreflightCachePath({ userSiteRoot, sessionSiteRoot });
  if (!cachePath) return;
  try {
    const cacheRoot = codexSubscriptionPreflightCacheRoot({ userSiteRoot, sessionSiteRoot });
    const cacheDir = userSiteRoot
      ? join(cacheRoot, '.narada', 'runtime', 'provider-auth-cache')
      : join(cacheRoot, '.ai', 'runtime');
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
