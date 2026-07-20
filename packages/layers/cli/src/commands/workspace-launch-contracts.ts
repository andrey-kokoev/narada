import { resolve } from 'node:path';
import {
  ADMITTED_RUNTIME_SUBSTRATE_KINDS,
  resolveOperatorSurfaceRuntimeSelection,
} from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import type { WorkspaceLaunchRecord } from './workspace-launch-types.js';

export const ADMITTED_WORKSPACE_LAUNCH_MCP_SCOPES = Object.freeze([
  'all',
  'host',
  'user-site',
  'local-site',
  'none',
]);

export const ADMITTED_WORKSPACE_LAUNCH_AUTHORITIES = Object.freeze(['auto', 'read', 'write']);
export const WORKSPACE_LAUNCH_CAPABILITY_MATRIX_SCHEMA = 'narada.workspace_launch.capability_matrix.v1';
export const WORKSPACE_LAUNCH_PATH_PROVENANCE_SCHEMA = 'narada.workspace_launch.path_provenance.v1';
export const WORKSPACE_LAUNCH_TRANSACTION_SCHEMA = 'narada.workspace_launch.transaction.v1';
const WORKSPACE_LAUNCH_TRANSACTION_STATES = ['planned', 'preflighted', 'spawned', 'handed_off', 'attached', 'completed', 'failed'] as const;
type WorkspaceLaunchTransactionState = typeof WORKSPACE_LAUNCH_TRANSACTION_STATES[number];

export interface WorkspaceLaunchRollbackEvidence {
  attempted: boolean;
  completed: boolean;
  orphan_count: number;
  statuses: Array<'terminated' | 'not_running' | 'refused'>;
  targets: WorkspaceLaunchRollbackTargetEvidence[];
}

export interface WorkspaceLaunchRollbackTargetEvidence {
  index: number;
  agent_id: string | null;
  launch_session_id: string | null;
  pid: number | null;
  owner_ref: string | null;
  status: 'terminated' | 'not_running' | 'refused';
  reason: string;
}

function isWorkspaceLaunchTransactionState(value: unknown): value is WorkspaceLaunchTransactionState {
  return typeof value === 'string'
    && (WORKSPACE_LAUNCH_TRANSACTION_STATES as readonly string[]).includes(value);
}

export class WorkspaceLaunchContractError extends Error {
  readonly reasonCode: string;
  readonly reason: string;
  readonly requiredNextStep: string;
  readonly artifactPath: string | null;

  constructor(reasonCode: string, reason: string, requiredNextStep: string, artifactPath: string | null = null) {
    super(`${reasonCode}: ${reason}`);
    this.name = 'WorkspaceLaunchContractError';
    this.reasonCode = reasonCode;
    this.reason = reason;
    this.requiredNextStep = requiredNextStep;
    this.artifactPath = artifactPath;
  }
}

export function normalizeExplicitWorkspaceLaunchMcpScope(value: unknown, source = 'workspace launch selection'): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_mcp_scope_missing',
      `MCP scope must be explicitly admitted by ${source}; ambient scope=all is forbidden.`,
      'Set McpScope on the Site/agent launch record or pass --mcp-scope <scope>.',
    );
  }
  const normalized = value.trim().toLowerCase();
  if ((ADMITTED_WORKSPACE_LAUNCH_MCP_SCOPES as readonly string[]).includes(normalized)) return normalized;
  throw new WorkspaceLaunchContractError(
    'workspace_launch_mcp_scope_not_admitted',
    `${normalized} is not an admitted MCP scope.`,
    `Use one of: ${ADMITTED_WORKSPACE_LAUNCH_MCP_SCOPES.join(', ')}.`,
  );
}

export function normalizeWorkspaceLaunchAuthority(value: unknown): string {
  const normalized = String(value ?? 'auto').trim().toLowerCase();
  if ((ADMITTED_WORKSPACE_LAUNCH_AUTHORITIES as readonly string[]).includes(normalized)) return normalized;
  throw new WorkspaceLaunchContractError(
    'workspace_launch_authority_not_admitted',
    `${normalized} is not an admitted runtime authority.`,
    `Use one of: ${ADMITTED_WORKSPACE_LAUNCH_AUTHORITIES.join(', ')}.`,
  );
}

export interface WorkspaceLaunchCapabilityMatrixInput {
  operatorSurface: string;
  runtime: string;
  mcpScope: string;
  authority: string;
}

export function buildWorkspaceLaunchCapabilityAdmission(input: WorkspaceLaunchCapabilityMatrixInput): Record<string, unknown> {
  const selection = resolveOperatorSurfaceRuntimeSelection({
    operatorSurfaceValue: input.operatorSurface,
    runtimeValue: input.runtime,
    admittedRuntimeSubstrateKinds: [...ADMITTED_RUNTIME_SUBSTRATE_KINDS],
    runtimeContractSchema: 'narada.runtime_substrate_kind.v1',
  });
  if (selection.status === 'refused') {
    throw new WorkspaceLaunchContractError(
      selection.reason_code,
      selection.reason,
      selection.required_next_step,
    );
  }
  const mcpScope = normalizeExplicitWorkspaceLaunchMcpScope(input.mcpScope);
  const authority = normalizeWorkspaceLaunchAuthority(input.authority);
  const matrix = {
    schema: WORKSPACE_LAUNCH_CAPABILITY_MATRIX_SCHEMA,
    generated_from: {
      launch_matrix_schema: 'narada.carrier_launch_matrix.v3',
      runtime_contract_schema: 'narada.runtime_substrate_kind.v1',
      intelligence_contract_schema: 'narada.invokable-intelligence.selection-authority.v1',
    },
    dimensions: {
      operator_surface: selection.operator_surface_kind,
      runtime: selection.runtime_substrate_kind,
      intelligence_resolution: 'runtime-invocation',
      mcp_scope: mcpScope,
      authority,
    },
    admission: 'admitted',
    intelligence_source: 'site_catalog_and_runtime_policy',
    mcp_scope_source: 'explicit_selection_or_site_record',
    authority_source: 'explicit_selection_or_site_record',
  };
  return matrix;
}

export function buildWorkspaceLaunchPathProvenance(record: WorkspaceLaunchRecord): Record<string, unknown> {
  return {
    schema: WORKSPACE_LAUNCH_PATH_PROVENANCE_SCHEMA,
    fallback_policy: 'none',
    roots: {
      narada: { path: record.narada_root, source: 'launch_registry.narada_root' },
      site: { path: record.site_root, source: 'launch_registry.site_root' },
      workspace: { path: record.workspace_root ?? record.site_root, source: record.workspace_root ? 'launch_registry.workspace_root' : 'site_root_explicit' },
      config: { path: record.config_path, source: 'launch_registry.path' },
    },
  };
}

export function assertWorkspaceLaunchPathProvenance(provenance: unknown): void {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new WorkspaceLaunchContractError('workspace_launch_path_provenance_missing', 'Path provenance is required.', 'Regenerate the launch plan from the canonical registry.');
  }
  const value = provenance as { schema?: unknown; fallback_policy?: unknown; roots?: Record<string, { path?: unknown; source?: unknown }> };
  if (value.schema !== WORKSPACE_LAUNCH_PATH_PROVENANCE_SCHEMA || value.fallback_policy !== 'none') {
    throw new WorkspaceLaunchContractError('workspace_launch_path_provenance_invalid', 'Path provenance is not canonical.', 'Regenerate the launch plan from the canonical registry.');
  }
  const roots = value.roots;
  if (!roots || typeof roots !== 'object' || Array.isArray(roots)) {
    throw new WorkspaceLaunchContractError('workspace_launch_path_provenance_incomplete', 'Path provenance roots are missing.', 'Regenerate the launch plan from the canonical registry.');
  }
  for (const name of ['narada', 'site', 'workspace', 'config']) {
    const root = roots[name];
    if (!root || typeof root.path !== 'string' || !root.path.trim() || typeof root.source !== 'string' || !root.source.trim()) {
      throw new WorkspaceLaunchContractError('workspace_launch_path_provenance_incomplete', `Missing ${name} path provenance.`, 'Regenerate the launch plan from the canonical registry.');
    }
  }
}

export function assertStructuredWorkspaceLaunchArgv(args: unknown, field: string): asserts args is string[] {
  if (!Array.isArray(args) || args.length === 0 || args.some((value) => typeof value !== 'string')) {
    throw new WorkspaceLaunchContractError('workspace_launch_structured_argv_invalid', `${field} must be a non-empty string array.`, 'Regenerate the launch plan; do not pass a shell command string as execution authority.');
  }
}

export function createWorkspaceLaunchTransaction(launchSessionId: string | null, status: 'planned' | 'preflighted' | 'spawned' | 'handed_off' | 'attached' | 'completed' | 'failed' = 'planned') {
  return {
    schema: WORKSPACE_LAUNCH_TRANSACTION_SCHEMA,
    launch_session_id: launchSessionId,
    state: status,
    history: [status],
    rollback: { attempted: false, completed: false, orphan_count: 0, statuses: [], targets: [] },
  } as const;
}

export function advanceWorkspaceLaunchTransaction(
  transaction: Record<string, unknown>,
  nextState: Exclude<WorkspaceLaunchTransactionState, 'planned' | 'failed'>,
): Record<string, unknown> {
  if (transaction.schema !== WORKSPACE_LAUNCH_TRANSACTION_SCHEMA || !Array.isArray(transaction.history)) {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_transaction_invalid',
      'Cannot advance a malformed launch transaction.',
      'Regenerate the launch plan before executing it.',
    );
  }
  const history = transaction.history.filter((entry): entry is string => typeof entry === 'string');
  const current = transaction.state;
  if (history.length === 0 || history.at(-1) !== current || !isWorkspaceLaunchTransactionState(current)) {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_transaction_invalid',
      'Launch transaction state and history do not agree.',
      'Regenerate the launch plan before executing it.',
    );
  }
  const allowedNext: Record<string, string> = {
    planned: 'preflighted',
    preflighted: 'spawned',
    spawned: 'attached',
    attached: 'completed',
    handed_off: 'completed',
  };
  if (current === 'spawned' && nextState === 'handed_off') {
    return { ...transaction, state: nextState, history: [...history, nextState] };
  }
  if (current === nextState) return { ...transaction, history };
  if (allowedNext[current] !== nextState) {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_transaction_transition_invalid',
      `Cannot transition launch transaction from ${String(current)} to ${nextState}.`,
      'Advance the launch through preflight, spawn, and attachment in order.',
    );
  }
  return { ...transaction, state: nextState, history: [...history, nextState] };
}

export function failWorkspaceLaunchTransaction(
  transaction: Record<string, unknown>,
  rollback: WorkspaceLaunchRollbackEvidence,
): Record<string, unknown> {
  if (transaction.schema !== WORKSPACE_LAUNCH_TRANSACTION_SCHEMA || !Array.isArray(transaction.history)) {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_transaction_invalid',
      'Cannot fail a malformed launch transaction.',
      'Regenerate the launch plan before executing it.',
    );
  }
  const history = transaction.history.filter((entry): entry is string => typeof entry === 'string');
  const current = transaction.state;
  if (history.length === 0 || history.at(-1) !== current || !isWorkspaceLaunchTransactionState(current)) {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_transaction_invalid',
      'Launch transaction state and history do not agree.',
      'Regenerate the launch plan before executing it.',
    );
  }
  if (current === 'completed') {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_transaction_transition_invalid',
      'A completed launch transaction cannot be failed.',
      'Inspect the completed launch result instead of retrying its transaction.',
    );
  }
  if (current === 'failed') return { ...transaction, history, rollback };
  return { ...transaction, state: 'failed', history: [...history, 'failed'], rollback };
}

export function completeWorkspaceLaunchTransaction(transaction: Record<string, unknown>): Record<string, unknown> {
  if (transaction.state === 'completed') return transaction;
  if (transaction.state !== 'attached' && transaction.state !== 'handed_off') {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_transaction_invalid',
      'A launch transaction can be completed only after exact attachment or explicit terminal handoff.',
      'Advance the launch through attachment or terminal handoff before finalizing it.',
    );
  }
  const current = advanceWorkspaceLaunchTransaction(transaction, 'completed');
  return {
    ...current,
    rollback: { attempted: false, completed: false, orphan_count: 0, statuses: [], targets: [] },
  };
}
