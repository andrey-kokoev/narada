import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeIntelligenceKernelKind } from '@narada2/nars-intelligence-kernel-contract';

export const INTELLIGENCE_LAUNCH_CONTEXT_SCHEMA = 'narada.intelligence.launch_context.v1';
export const INTELLIGENCE_PRINCIPAL_BINDING_SCHEMA = 'narada.intelligence.principal_binding.v1';

export interface IntelligencePrincipalBinding {
  schema: typeof INTELLIGENCE_PRINCIPAL_BINDING_SCHEMA;
  actor: {
    principal_id: string;
    auth_type: string;
  };
  memberships: Array<{
    registry: string;
    site_id: string;
    role: string;
    evidence_ref: string;
  }>;
  evidence_refs?: string[];
}

function normalizePrincipalBinding(value: unknown, expectedPrincipal: string): IntelligencePrincipalBinding | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      'principal_binding must be an explicit object containing actor and memberships.',
      { field: 'principal_binding' },
    );
  }
  const candidate = value as Record<string, unknown>;
  const actor = candidate.actor;
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      'principal_binding.actor is required.',
      { field: 'principal_binding.actor' },
    );
  }
  const actorRecord = actor as Record<string, unknown>;
  const actorPrincipal = normalizePrincipalId(actorRecord.principal_id);
  const authType = String(actorRecord.auth_type ?? '').trim();
  const memberships = candidate.memberships;
  if (!actorPrincipal || !authType || !Array.isArray(memberships)) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      'principal_binding requires actor.principal_id, actor.auth_type, and memberships[].',
      { field: 'principal_binding' },
    );
  }
  if (actorPrincipal !== expectedPrincipal) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_principal_binding_mismatch',
      `principal_binding actor ${actorPrincipal} does not match requested principal ${expectedPrincipal}.`,
      { actor_principal_id: actorPrincipal, principal_id: expectedPrincipal },
    );
  }
  const normalizedMemberships = memberships.map((membership, index) => {
    if (!membership || typeof membership !== 'object' || Array.isArray(membership)) {
      throw new IntelligenceLaunchContextError(
        'intelligence_context_invalid',
        `principal_binding.memberships[${index}] must be an object.`,
        { field: `principal_binding.memberships[${index}]` },
      );
    }
    const item = membership as Record<string, unknown>;
    const registry = String(item.registry ?? '').trim();
    const siteId = normalizeSiteId(item.site_id, `principal_binding.memberships[${index}].site_id`);
    const role = String(item.role ?? '').trim();
    const evidenceRef = String(item.evidence_ref ?? '').trim();
    if (!registry || !siteId || !role || !evidenceRef) {
      throw new IntelligenceLaunchContextError(
        'intelligence_context_invalid',
        `principal_binding.memberships[${index}] requires registry, site_id, role, and evidence_ref.`,
        { field: `principal_binding.memberships[${index}]` },
      );
    }
    return { registry, site_id: siteId, role, evidence_ref: evidenceRef };
  });
  const evidenceRefs = candidate.evidence_refs;
  if (evidenceRefs !== undefined && (!Array.isArray(evidenceRefs) || !evidenceRefs.every((ref) => typeof ref === 'string' && ref.trim()))) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      'principal_binding.evidence_refs must contain only non-empty strings.',
      { field: 'principal_binding.evidence_refs' },
    );
  }
  return {
    schema: INTELLIGENCE_PRINCIPAL_BINDING_SCHEMA,
    actor: { principal_id: actorPrincipal, auth_type: authType },
    memberships: normalizedMemberships,
    ...(Array.isArray(evidenceRefs) ? { evidence_refs: evidenceRefs.map((ref) => ref.trim()) } : {}),
  };
}

export class IntelligenceLaunchContextError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'IntelligenceLaunchContextError';
    this.code = code;
    this.details = details;
  }
}

function normalizeSiteId(value: unknown, field: string): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const canonical = raw.startsWith('site:') ? raw : `site:${raw}`;
  if (!/^site:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(canonical)) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      `${field} must be a canonical Site locus such as site:andrey-user`,
      { field, value: raw },
    );
  }
  return canonical;
}

function normalizePrincipalId(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const canonical = raw.startsWith('principal:') ? raw : `principal:${raw}`;
  if (!/^principal:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(canonical)) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      'principal_id must be a canonical principal such as principal:andrey',
      { field: 'principal_id', value: raw },
    );
  }
  return canonical;
}

function readJsonObject(path: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('document must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      `Cannot read intelligence launch context: ${path}`,
      { path, cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function inferSiteId(siteRoot: string): string | null {
  const candidates = [
    join(siteRoot, '.narada', 'site.identity.json'),
    join(siteRoot, '.narada', 'site.json'),
    join(siteRoot, 'site.identity.json'),
    join(siteRoot, 'site.json'),
    join(siteRoot, 'config.json'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const document = readJsonObject(path);
      const candidate = document.site_id
        ?? (document.static_config && typeof document.static_config === 'object'
          ? (document.static_config as Record<string, unknown>).site_id
          : null);
      if (candidate) return String(candidate);
    } catch (error) {
      if (error instanceof IntelligenceLaunchContextError && error.code === 'intelligence_context_invalid') {
        continue;
      }
      throw error;
    }
  }
  return null;
}

function resolveConfiguredPath(value: unknown, baseRoot: string): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return resolve(baseRoot, raw);
}

export function loadIntelligenceLaunchContext({
  targetSiteId = null,
  sessionSiteRoot,
  userSiteRoot,
  registryDbPath,
  processEnv = process.env,
}: {
  targetSiteId?: string | null;
  sessionSiteRoot: string;
  userSiteRoot: string;
  registryDbPath: string;
  processEnv?: NodeJS.ProcessEnv;
}) {
  const contextPath = resolve(
    processEnv.NARADA_INTELLIGENCE_CONTEXT_PATH
      ?? join(userSiteRoot, '.narada', 'intelligence-launch-context.json'),
  );
  const contextExists = existsSync(contextPath);
  const document = contextExists ? readJsonObject(contextPath) : {};
  if (contextExists && document.schema !== INTELLIGENCE_LAUNCH_CONTEXT_SCHEMA) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      `Unsupported intelligence launch context schema: ${String(document.schema ?? '<missing>')}`,
      { path: contextPath, expected_schema: INTELLIGENCE_LAUNCH_CONTEXT_SCHEMA },
    );
  }

  const target = normalizeSiteId(
    targetSiteId
      ?? processEnv.NARADA_INTELLIGENCE_TARGET_SITE
      ?? inferSiteId(sessionSiteRoot),
    'target_site_id',
  );
  const userSite = normalizeSiteId(
    document.user_site_id ?? processEnv.NARADA_INTELLIGENCE_USER_SITE ?? inferSiteId(userSiteRoot),
    'user_site_id',
  );
  const hostSite = normalizeSiteId(
    document.host_site_id
      ?? processEnv.NARADA_INTELLIGENCE_HOST_SITE
      ?? processEnv.NARADA_HOST_SITE_ID
      ?? processEnv.NARADA_PC_SITE_ID,
    'host_site_id',
  );
  const principal = normalizePrincipalId(
    document.principal_id ?? processEnv.NARADA_INTELLIGENCE_PRINCIPAL_ID,
  );
  const missing = [
    ['target_site_id', target],
    ['user_site_id', userSite],
    ['host_site_id', hostSite],
    ['principal_id', principal],
  ].filter(([, value]) => !value).map(([field]) => field);
  if (missing.length > 0) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_not_configured',
      `Intelligence launch context is incomplete: ${missing.join(', ')}`,
      {
        context_path: contextPath,
        context_exists: contextExists,
        user_site_root: userSiteRoot,
        session_site_root: sessionSiteRoot,
        missing,
        required_fields: ['target_site_id', 'user_site_id', 'host_site_id', 'principal_id'],
      },
    );
  }

  const configuredRegistryDbPath = resolveConfiguredPath(document.registry_db_path, userSiteRoot);
  const effectiveRegistryDbPath = configuredRegistryDbPath ?? resolve(registryDbPath);
  const principalBinding = normalizePrincipalBinding(document.principal_binding, principal);
  let intelligenceKernelKind: string;
  try {
    intelligenceKernelKind = normalizeIntelligenceKernelKind(
      document.intelligence_kernel_kind ?? processEnv.NARADA_INTELLIGENCE_KERNEL,
    );
  } catch (error) {
    throw new IntelligenceLaunchContextError(
      'intelligence_context_invalid',
      error instanceof Error ? error.message : String(error),
      { context_path: contextPath, field: 'intelligence_kernel_kind' },
    );
  }
  return {
    schema: INTELLIGENCE_LAUNCH_CONTEXT_SCHEMA,
    status: 'ready',
    source: contextExists ? 'user_site_document' : 'explicit_environment_or_site_metadata',
    context_path: contextPath,
    registry_db_path: effectiveRegistryDbPath,
    target_site: target,
    user_site: userSite,
    host_site: hostSite,
    principal_id: principal,
    intelligence_kernel_kind: intelligenceKernelKind,
    ...(principalBinding ? { principal_binding: principalBinding } : {}),
    environment: {
      NARADA_INTELLIGENCE_REGISTRY_DB: effectiveRegistryDbPath,
      NARADA_INTELLIGENCE_TARGET_SITE: target,
      NARADA_INTELLIGENCE_USER_SITE: userSite,
      NARADA_INTELLIGENCE_HOST_SITE: hostSite,
      NARADA_INTELLIGENCE_PRINCIPAL_ID: principal,
      NARADA_INTELLIGENCE_KERNEL: intelligenceKernelKind,
      ...(principalBinding ? { NARADA_INTELLIGENCE_PRINCIPAL_BINDING: JSON.stringify(principalBinding) } : {}),
    },
  };
}
