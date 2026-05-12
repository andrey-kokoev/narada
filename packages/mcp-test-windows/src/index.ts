export type WindowsTestKind = 'node' | 'powershell' | 'rust' | 'dotnet' | 'operator_surface_integration';

export interface WindowsTestTargetDescriptor {
  schema: 'narada.mcp_test_windows.target_descriptor.v0';
  target_id: string;
  kind: WindowsTestKind;
  command_descriptor: string;
  allowed_by_policy_ref: string;
  source_pass_fail_imported: false;
}

export interface WindowsTestEvidencePayload {
  schema: 'narada.mcp_test_windows.evidence_payload.v0';
  target_id: string;
  status: 'planned' | 'passed' | 'failed' | 'refused';
  evidence_refs: string[];
  receiving_site_generated: true;
}

export function buildWindowsTestTargetDescriptor(input: {
  target_id: string;
  kind: WindowsTestKind;
  command_descriptor: string;
  allowed_by_policy_ref: string;
}): WindowsTestTargetDescriptor {
  return {
    schema: 'narada.mcp_test_windows.target_descriptor.v0',
    target_id: input.target_id,
    kind: input.kind,
    command_descriptor: input.command_descriptor,
    allowed_by_policy_ref: input.allowed_by_policy_ref,
    source_pass_fail_imported: false,
  };
}

export function buildWindowsTestEvidencePayload(target_id: string): WindowsTestEvidencePayload {
  return {
    schema: 'narada.mcp_test_windows.evidence_payload.v0',
    target_id,
    status: 'planned',
    evidence_refs: [],
    receiving_site_generated: true,
  };
}

export {
  buildWindowsTestRunRequest,
  decideWindowsTestRun,
  type WindowsTestRegistryEntry,
  type WindowsTestRunDecision,
  type WindowsTestRunRequest,
} from './run-contract.js';
