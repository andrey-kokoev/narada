export interface WindowsTestRegistryEntry {
  test_id: string;
  path?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  description: string;
}

export interface WindowsTestRunRequest {
  schema: 'narada.mcp_test_windows.run_request.v0';
  test_id?: string;
  path?: string;
  timeout_seconds?: number;
  authority_basis: string;
  source_result_import_requested?: boolean;
  credentials_requested?: boolean;
}

export interface WindowsTestRunDecision {
  schema: 'narada.mcp_test_windows.run_decision.v0';
  status: 'planned_descriptor' | 'refused';
  target?: WindowsTestRegistryEntry;
  refusals: string[];
  warnings: string[];
  executed: false;
  receiving_site_evidence_required: true;
  source_pass_fail_imported: false;
}

export function buildWindowsTestRunRequest(input: Omit<WindowsTestRunRequest, 'schema'>): WindowsTestRunRequest {
  return {
    schema: 'narada.mcp_test_windows.run_request.v0',
    ...input,
  };
}

export function decideWindowsTestRun(
  request: WindowsTestRunRequest,
  registry: WindowsTestRegistryEntry[],
): WindowsTestRunDecision {
  const refusals: string[] = [];
  const warnings: string[] = [];

  if (request.test_id && request.path) refusals.push('run_test_accepts_test_id_or_path_not_both');
  if (!request.test_id && !request.path) refusals.push('run_test_requires_test_id_or_path');
  if (request.source_result_import_requested) refusals.push('source_pass_fail_import_refused');
  if (request.credentials_requested) refusals.push('credential_import_refused');
  if (request.timeout_seconds !== undefined && (request.timeout_seconds < 1 || request.timeout_seconds > 300)) {
    refusals.push('timeout_outside_allowed_range');
  }
  if (request.path) {
    const pathRefusal = validateApprovedTestPath(request.path);
    if (pathRefusal) refusals.push(pathRefusal);
  }

  const target = resolveTarget(request, registry);
  if (!target && request.test_id && !request.path) refusals.push('unknown_test_id');
  if (target?.command && !target.path) warnings.push('command_registry_entry_requires_receiving_site_carrier_admission');

  return {
    schema: 'narada.mcp_test_windows.run_decision.v0',
    status: refusals.length > 0 ? 'refused' : 'planned_descriptor',
    target: refusals.length > 0 ? undefined : target,
    refusals,
    warnings,
    executed: false,
    receiving_site_evidence_required: true,
    source_pass_fail_imported: false,
  };
}

function resolveTarget(
  request: WindowsTestRunRequest,
  registry: WindowsTestRegistryEntry[],
): WindowsTestRegistryEntry | undefined {
  if (request.test_id) return registry.find((entry) => entry.test_id === request.test_id);
  if (!request.path) return undefined;
  return {
    test_id: inferTestId(request.path),
    path: normalizePath(request.path),
    description: 'Ad hoc approved test path supplied by receiving Site.',
  };
}

function validateApprovedTestPath(inputPath: string): string | null {
  if (/[;&|`$<>]/.test(inputPath)) return 'test_path_rejected_suspicious_input';
  if (/\bwsl(?:\.exe)?\b/i.test(inputPath)) return 'test_path_rejected_wsl_crossing';
  const path = normalizePath(inputPath);
  if (path.startsWith('../') || path.includes('/../')) return 'test_path_outside_root';
  if (!path.startsWith('tools/')) return 'test_path_not_approved';
  if (path.endsWith('.test.mjs')) return null;
  const parts = path.split('/');
  if (parts.includes('tests') && path.split('/').pop()?.startsWith('Test-') && path.endsWith('.mjs')) return null;
  return 'test_path_not_approved';
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function inferTestId(path: string): string {
  return normalizePath(path)
    .replace(/^tools\//, '')
    .replace(/\.test\.mjs$/i, '')
    .replace(/\.mjs$/i, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}
