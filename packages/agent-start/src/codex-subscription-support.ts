import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { codexCommand } from '@narada2/carrier-provider-support/codex-subscription-command';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

export const CODEX_SUBSCRIPTION_PREFLIGHT_ENV = 'NARADA_CODEX_SUBSCRIPTION_PREFLIGHT';
export const CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS = 60000;

export function codexSubscriptionPreflightForced(processEnv = process.env) {
  const mode = String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_ENV] ?? '').trim().toLowerCase();
  return mode === 'force';
}

export function codexPreflightCommand(processEnv = process.env, processPlatform = process.platform) {
  return codexCommand({ processEnv, platform: processPlatform, exists: existsSync });
}
export function codexAuthHome(processEnv = process.env) {
  if (processEnv.NARADA_CODEX_AUTH_HOME) return processEnv.NARADA_CODEX_AUTH_HOME;
  const userRoot = processEnv.USERPROFILE || processEnv.HOME || homedir();
  return userRoot ? join(userRoot, '.codex') : null;
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
  dryRun = false,
} = {}) {
  const mode = String(processEnv[CODEX_SUBSCRIPTION_PREFLIGHT_ENV] ?? '').trim().toLowerCase();
  if (!codexSubscriptionPreflightForced(processEnv)) {
    return {
      schema: 'narada.codex_subscription.preflight.v1',
      status: 'deferred_until_first_provider_call',
      ok: true,
      provider,
      command: 'codex exec --json',
      mode: mode || 'default',
      environment_variable: CODEX_SUBSCRIPTION_PREFLIGHT_ENV,
      reason: dryRun
        ? 'Dry-run validates launch shape without making a provider call.'
        : 'Launch defers local Codex subscription auth validation until the first provider call.',
    };
  }

  const command = codexPreflightCommand(processEnv, processPlatform);
  const prompt = 'Return exactly: ok';
  const result = spawnSync(command.command, [...command.prefixArgs, 'exec', '--json', prompt], {
    cwd: sessionSiteRoot,
    encoding: 'utf8',
    timeout: CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS,
    windowsHide: true,
    env: codexSubscriptionPreflightEnv(processEnv),
  });
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  const combined = `${stdout}\n${stderr}`;
  const unauthorized = /401\s+Unauthorized|Unauthorized/i.test(combined);
  return {
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
    stderr_first_line: stderr.split(/\r?\n/).find((line) => line.trim()) ?? '',
    timeout_ms: CODEX_SUBSCRIPTION_PREFLIGHT_TIMEOUT_MS,
  };
}

export function codexContextIsolationStatus({ exec = false, dryRun = false } = {}) {
  return {
    status: exec && !dryRun ? 'fresh_launcher_bound' : 'fresh_launch_planned',
    code: exec && !dryRun ? 'codex_fresh_launcher_bound' : 'codex_fresh_launch_planned',
    runtime: 'codex',
    runtime_substrate_kind: 'codex',
    reason: 'Narada can start a fresh Codex carrier with a bound agent identity and MCP-only posture. Exact resume proof remains a separate unadmitted boundary.',
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
