import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildNaradaProperArchitectRolePolicyProjection,
  validateNaradaProperArchitectAllowedTools,
  type NaradaProperMcpRolePolicyProjection,
} from './surface-registry.js';

export interface LocalMcpPolicyReconcileResult {
  schema: 'narada.local_mcp_policy_reconcile_result.v0';
  status: 'ok' | 'drift' | 'repaired' | 'error';
  mode: 'check' | 'apply';
  exit_code: 0 | 1 | 2;
  config_path: string;
  target_subtree: 'mcp.role_policies.architect.servers["narada-proper"].allowed_tools';
  policy_source: NaradaProperMcpRolePolicyProjection['policy_source'] | null;
  config_json_role: 'site_local_runtime_posture';
  mutation_attempted: boolean;
  mutation_performed: boolean;
  additions: string[];
  removals: string[];
  validation_errors: string[];
  evidence_path: string | null;
  error?: string;
}

export function reconcileLocalMcpRolePolicy(input: {
  siteRoot: string;
  apply?: boolean;
  projection?: NaradaProperMcpRolePolicyProjection;
  by?: string;
}): LocalMcpPolicyReconcileResult {
  const configPath = resolve(input.siteRoot, 'config.json');
  const projection = input.projection ?? buildNaradaProperArchitectRolePolicyProjection();
  const mode: LocalMcpPolicyReconcileResult['mode'] = input.apply ? 'apply' : 'check';
  const base = {
    schema: 'narada.local_mcp_policy_reconcile_result.v0' as const,
    mode,
    config_path: configPath,
    target_subtree: 'mcp.role_policies.architect.servers["narada-proper"].allowed_tools' as const,
    policy_source: projection.policy_source,
    config_json_role: 'site_local_runtime_posture' as const,
  };

  if (!existsSync(configPath)) {
    return {
      ...base,
      status: 'error',
      exit_code: 2,
      mutation_attempted: Boolean(input.apply),
      mutation_performed: false,
      additions: [],
      removals: [],
      validation_errors: [],
      evidence_path: null,
      error: 'config_json_missing',
    };
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {
      ...base,
      status: 'error',
      exit_code: 2,
      mutation_attempted: Boolean(input.apply),
      mutation_performed: false,
      additions: [],
      removals: [],
      validation_errors: [],
      evidence_path: null,
      error: 'config_json_malformed',
    };
  }

  const configuredTools = readConfiguredAllowedTools(config);
  if (!configuredTools) {
    return {
      ...base,
      status: 'error',
      exit_code: 2,
      mutation_attempted: Boolean(input.apply),
      mutation_performed: false,
      additions: [],
      removals: [],
      validation_errors: [],
      evidence_path: null,
      error: 'allowed_tools_subtree_missing_or_malformed',
    };
  }

  const expected = projection.tool_policy.canonical_allowed_tools;
  const validation = validateNaradaProperArchitectAllowedTools(configuredTools, projection);
  const configured = new Set(configuredTools);
  const expectedSet = new Set(expected);
  const additions = expected.filter((tool) => !configured.has(tool));
  const removals = configuredTools.filter((tool) => !expectedSet.has(tool)).sort();
  const drift = additions.length > 0 || removals.length > 0 || validation.errors.length > 0;

  if (!drift) {
    return {
      ...base,
      status: 'ok',
      exit_code: 0,
      mutation_attempted: Boolean(input.apply),
      mutation_performed: false,
      additions,
      removals,
      validation_errors: validation.errors,
      evidence_path: null,
    };
  }

  if (!input.apply) {
    return {
      ...base,
      status: 'drift',
      exit_code: 1,
      mutation_attempted: false,
      mutation_performed: false,
      additions,
      removals,
      validation_errors: validation.errors,
      evidence_path: null,
    };
  }

  setConfiguredAllowedTools(config, expected);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  const evidencePath = writeRepairEvidence(input.siteRoot, {
    by: input.by ?? 'narada-proper-mcp',
    config_path: configPath,
    target_subtree: base.target_subtree,
    policy_source: projection.policy_source,
    additions,
    removals,
    validation_errors: validation.errors,
  });

  return {
    ...base,
    status: 'repaired',
    exit_code: 0,
    mutation_attempted: true,
    mutation_performed: true,
    additions,
    removals,
    validation_errors: validation.errors,
    evidence_path: evidencePath,
  };
}

function readConfiguredAllowedTools(config: Record<string, unknown>): string[] | null {
  const server = naradaProperServerRecord(config);
  const allowedTools = server?.allowed_tools;
  return Array.isArray(allowedTools) && allowedTools.every((tool) => typeof tool === 'string')
    ? allowedTools
    : null;
}

function setConfiguredAllowedTools(config: Record<string, unknown>, tools: string[]): void {
  const server = naradaProperServerRecord(config);
  if (!server) throw new Error('allowed_tools_subtree_missing_or_malformed');
  server.allowed_tools = tools;
}

function naradaProperServerRecord(config: Record<string, unknown>): (Record<string, unknown> & { allowed_tools?: unknown }) | null {
  const mcp = record(config.mcp);
  const rolePolicies = record(mcp?.role_policies);
  const architect = record(rolePolicies?.architect);
  const servers = record(architect?.servers);
  return record(servers?.['narada-proper']);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function writeRepairEvidence(siteRoot: string, evidence: Record<string, unknown>): string {
  const occurredAt = new Date().toISOString();
  const payload = {
    schema: 'narada.local_mcp_policy_repair_evidence.v0',
    authority_class: 'site_local_config_role_policy_reconciliation',
    config_json_role: 'site_local_runtime_posture',
    mutation_scope: 'allowed_tools_subtree_only',
    mutation_performed: true,
    occurred_at: occurredAt,
    ...evidence,
  };
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  const evidenceDir = resolve(siteRoot, '.ai', 'mutation-evidence', 'mcp_policy');
  const evidencePath = resolve(evidenceDir, `mcp_policy_repair_${digest}.json`);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return evidencePath;
}
