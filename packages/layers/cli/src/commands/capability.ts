import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  capabilityRegistryPath,
  grantEffectiveStatus,
  makeCapabilityGrant,
  parseCsv,
  parseScopeJson,
  readCapabilityRegistry,
  validateCredentialRef,
  writeCapabilityRegistry,
} from '../lib/capability-consent-registry.js';

export interface CapabilityGrantOptions {
  cwd?: string;
  site?: string;
  principal?: string;
  agent?: string;
  kind?: string;
  scope?: string;
  allow?: string;
  deny?: string;
  credentialRef?: string;
  evidenceRef?: string;
  expiresAt?: string;
  by?: string;
  format?: string;
}

export interface CapabilityListOptions {
  cwd?: string;
  site?: string;
  principal?: string;
  agent?: string;
  kind?: string;
  status?: string;
  limit?: number;
  format?: string;
}

export interface CapabilityExplainOptions {
  cwd?: string;
  grantId?: string;
  format?: string;
}

export interface CapabilityRevokeOptions {
  cwd?: string;
  grantId?: string;
  by?: string;
  reason?: string;
  format?: string;
}

function requireOption(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizeError(error: unknown): { exitCode: ExitCode; result: unknown } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: { status: 'error', error: message },
  };
}

export async function capabilityGrantCommand(
  options: CapabilityGrantOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const siteId = requireOption(options.site, '--site');
    const principalId = requireOption(options.principal, '--principal');
    const kind = requireOption(options.kind, '--kind');
    const grantedBy = requireOption(options.by, '--by');
    const allowedActions = parseCsv(options.allow);
    if (allowedActions.length === 0) {
      throw new Error('--allow must include at least one action');
    }
    const credentialRef = validateCredentialRef(options.credentialRef);
    const grant = makeCapabilityGrant({
      siteId,
      principalId,
      agentId: options.agent,
      capabilityKind: kind,
      scope: parseScopeJson(options.scope),
      allowedActions,
      deniedActions: parseCsv(options.deny),
      credentialRef,
      evidenceRef: options.evidenceRef,
      expiresAt: options.expiresAt,
      grantedBy,
    });
    const registry = await readCapabilityRegistry(cwd);
    registry.grants.push(grant);
    const path = await writeCapabilityRegistry(cwd, registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        grant,
        secret_values_stored: false,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function capabilityListCommand(
  options: CapabilityListOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const registry = await readCapabilityRegistry(cwd);
  const limit = options.limit ?? 20;
  const grants = registry.grants
    .map((grant) => ({ ...grant, effective_status: grantEffectiveStatus(grant) }))
    .filter((grant) => !options.site || grant.site_id === options.site)
    .filter((grant) => !options.principal || grant.principal_id === options.principal)
    .filter((grant) => !options.agent || grant.agent_id === options.agent)
    .filter((grant) => !options.kind || grant.capability_kind === options.kind)
    .filter((grant) => !options.status || grant.effective_status === options.status)
    .slice(0, limit);
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: capabilityRegistryPath(cwd),
      count: grants.length,
      limit,
      grants,
    },
  };
}

export async function capabilityExplainCommand(
  options: CapabilityExplainOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const grantId = requireOption(options.grantId, '<grant-id>');
  const cwd = options.cwd ?? '.';
  const registry = await readCapabilityRegistry(cwd);
  const grant = registry.grants.find((entry) => entry.grant_id === grantId);
  if (!grant) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Capability grant not found: ${grantId}` },
    };
  }
  const effectiveStatus = grantEffectiveStatus(grant);
  const blockers = [];
  if (effectiveStatus === 'revoked') blockers.push('grant revoked');
  if (effectiveStatus === 'expired') blockers.push('grant expired');
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: capabilityRegistryPath(cwd),
      grant,
      effective_status: effectiveStatus,
      admissible_for_execution: blockers.length === 0,
      blockers,
      explanation: blockers.length === 0
        ? 'Grant is active. Execution surfaces must still satisfy local crossing law and action-specific validation.'
        : `Grant is not currently admissible: ${blockers.join(', ')}`,
      secret_values_stored: false,
    },
  };
}

export async function capabilityRevokeCommand(
  options: CapabilityRevokeOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const grantId = requireOption(options.grantId, '<grant-id>');
    const revokedBy = requireOption(options.by, '--by');
    const registry = await readCapabilityRegistry(options.cwd ?? '.');
    const grant = registry.grants.find((entry) => entry.grant_id === grantId);
    if (!grant) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: `Capability grant not found: ${grantId}` },
      };
    }
    grant.status = 'revoked';
    grant.revoked_by = revokedBy;
    grant.revoked_at = new Date().toISOString();
    grant.revocation_reason = options.reason ?? null;
    const path = await writeCapabilityRegistry(options.cwd ?? '.', registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        grant,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}
