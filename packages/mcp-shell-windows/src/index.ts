export type WindowsShellApprovalCategory =
  | 'read_only'
  | 'test'
  | 'format'
  | 'git_status'
  | 'git_commit'
  | 'break_glass';

export interface WindowsShellExecutionEnvelope {
  schema: 'narada.mcp_shell_windows.execution_envelope.v0';
  command: string;
  args: string[];
  category: WindowsShellApprovalCategory;
  authority_basis: string;
  audit_required: true;
  executed: false;
}

export interface WindowsShellPolicyDecision {
  schema: 'narada.mcp_shell_windows.policy_decision.v0';
  status: 'allowed_descriptor' | 'refused';
  reasons: string[];
  live_shell_authority_granted: false;
  credentials_imported: false;
}

export function buildWindowsShellEnvelope(input: {
  command: string;
  args?: string[];
  category: WindowsShellApprovalCategory;
  authority_basis: string;
}): WindowsShellExecutionEnvelope {
  return {
    schema: 'narada.mcp_shell_windows.execution_envelope.v0',
    command: input.command,
    args: input.args ?? [],
    category: input.category,
    authority_basis: input.authority_basis,
    audit_required: true,
    executed: false,
  };
}

export function decideWindowsShellPolicy(envelope: WindowsShellExecutionEnvelope): WindowsShellPolicyDecision {
  const reasons: string[] = [];
  if (envelope.command.toLowerCase().includes('wsl')) reasons.push('raw_wsl_crossing_refused');
  if (envelope.category === 'break_glass') reasons.push('break_glass_requires_receiving_site_admission');
  return {
    schema: 'narada.mcp_shell_windows.policy_decision.v0',
    status: reasons.length > 0 ? 'refused' : 'allowed_descriptor',
    reasons,
    live_shell_authority_granted: false,
    credentials_imported: false,
  };
}

export {
  buildWindowsShellBoundaryRequest,
  decideWindowsShellBoundary,
  type WindowsMcpOwnership,
  type WindowsShellBoundaryDecision,
  type WindowsShellBoundaryRequest,
  type WindowsShellToolName,
} from './policy-boundary.js';
