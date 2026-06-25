import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROLE_ENFORCEMENT_VALUES = new Set(['off', 'warn', 'strict']);

export function normalizeRoleEnforcement(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (ROLE_ENFORCEMENT_VALUES.has(normalized)) return normalized;
  if (normalized === 'advisory' || normalized === 'suggested_role') return 'warn';
  if (normalized === 'required' || normalized === 'required_role') return 'strict';
  return null;
}

export function resolveTaskRolePolicy({ siteRoot, taskSpec = null, env = process.env } = {}) {
  const chain = [{
    scope: 'product_default',
    source: 'built_in',
    path: null,
    value: 'strict',
    status: 'applied',
  }];

  const hostPath = resolveHostConfigPath(env);
  appendConfigPolicy(chain, {
    scope: 'host',
    path: hostPath,
    value: hostPath ? readRoleEnforcementFromConfig(hostPath) : null,
  });

  const userSitePath = resolveUserSiteConfigPath(env);
  appendConfigPolicy(chain, {
    scope: 'user_site',
    path: userSitePath,
    value: userSitePath ? readRoleEnforcementFromConfig(userSitePath) : null,
  });

  const sitePath = siteRoot ? join(resolve(siteRoot), '.narada', 'site.json') : null;
  appendConfigPolicy(chain, {
    scope: 'site',
    path: sitePath,
    value: sitePath ? readRoleEnforcementFromConfig(sitePath) : null,
  });

  appendConfigPolicy(chain, {
    scope: 'task',
    path: null,
    value: readRoleEnforcementFromTaskSpec(taskSpec),
  });

  const applied = chain.filter((entry) => entry.status === 'applied').at(-1) ?? chain[0];
  return {
    schema: 'narada.task.role_enforcement_policy.v0',
    role_enforcement: applied.value,
    effective_scope: applied.scope,
    effective_source: applied.source,
    effective_path: applied.path,
    chain,
    semantics: {
      off: 'target_role is advisory metadata only; mismatches are allowed without warnings.',
      warn: 'target_role mismatch is allowed and surfaced as a pre-claim warning.',
      strict: 'target_role mismatch blocks claim and continuation.',
    },
  };
}

export function roleMismatchSeverity(policy) {
  const mode = policy?.role_enforcement ?? 'strict';
  if (mode === 'strict') return 'blocker';
  if (mode === 'warn') return 'warning';
  return 'advisory';
}

function appendConfigPolicy(chain, { scope, path, value }) {
  if (!value) {
    chain.push({
      scope,
      source: scope,
      path: path ?? null,
      value: null,
      status: path ? 'absent_or_unset' : 'not_configured',
    });
    return;
  }
  chain.push({
    scope,
    source: scope,
    path: path ?? null,
    value,
    status: 'applied',
  });
}

function resolveHostConfigPath(env) {
  const explicit = env.NARADA_HOST_CONFIG_PATH || env.NARADA_HOST_CONFIG;
  if (explicit) return resolve(explicit);
  if (env.ProgramData) return join(env.ProgramData, 'Narada', 'host.json');
  return null;
}

function resolveUserSiteConfigPath(env) {
  const explicitRoot = env.NARADA_USER_SITE_ROOT || env.NARADA_USER_SITE;
  if (explicitRoot) return join(resolve(explicitRoot), '.narada', 'site.json');
  if (env.USERPROFILE) return join(env.USERPROFILE, 'Narada', '.narada', 'site.json');
  return null;
}

function readRoleEnforcementFromConfig(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const config = JSON.parse(readFileSync(path, 'utf8'));
    return normalizeRoleEnforcement(
      config?.task_lifecycle?.role_enforcement
      ?? config?.task_lifecycle?.claim_policy?.role_enforcement
      ?? config?.task_lifecycle?.target_role_enforcement
      ?? null
    );
  } catch {
    return null;
  }
}

function readRoleEnforcementFromTaskSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  return normalizeRoleEnforcement(
    spec?.claim_policy?.role_enforcement
    ?? spec?.task_lifecycle?.role_enforcement
    ?? spec?.role_enforcement
    ?? spec?.target_role_enforcement
    ?? null
  );
}
