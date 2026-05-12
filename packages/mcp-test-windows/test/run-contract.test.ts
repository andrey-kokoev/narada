import { describe, expect, it } from 'vitest';
import {
  buildWindowsTestRunRequest,
  decideWindowsTestRun,
  type WindowsTestRegistryEntry,
} from '../src/index.js';

const registry: WindowsTestRegistryEntry[] = [
  {
    test_id: 'shell_mcp',
    path: 'tools/mcp-servers/shell/shell-mcp-server.test.mjs',
    description: 'Shell MCP policy suite.',
  },
  {
    test_id: 'task_lifecycle_ps1_lint',
    command: 'pnpm',
    args: ['lint:ps1'],
    cwd: 'tools/task-lifecycle',
    description: 'Task lifecycle PowerShell lint suite.',
  },
];

describe('windows test MCP run contracts', () => {
  it('plans registered test ids without importing source pass/fail state', () => {
    const decision = decideWindowsTestRun(buildWindowsTestRunRequest({
      test_id: 'shell_mcp',
      timeout_seconds: 120,
      authority_basis: 'fixture',
    }), registry);

    expect(decision.status).toBe('planned_descriptor');
    expect(decision.target?.path).toBe('tools/mcp-servers/shell/shell-mcp-server.test.mjs');
    expect(decision.executed).toBe(false);
    expect(decision.source_pass_fail_imported).toBe(false);
    expect(decision.receiving_site_evidence_required).toBe(true);
  });

  it('accepts approved ad hoc test paths as descriptors', () => {
    const decision = decideWindowsTestRun(buildWindowsTestRunRequest({
      path: 'tools/task-lifecycle/tests/Test-McpGuard.mjs',
      authority_basis: 'fixture',
    }), registry);

    expect(decision.status).toBe('planned_descriptor');
    expect(decision.target?.test_id).toBe('task_lifecycle_tests_test_mcpguard');
  });

  it('warns that command registry entries need receiving-Site carrier admission', () => {
    const decision = decideWindowsTestRun(buildWindowsTestRunRequest({
      test_id: 'task_lifecycle_ps1_lint',
      authority_basis: 'fixture',
    }), registry);

    expect(decision.status).toBe('planned_descriptor');
    expect(decision.warnings).toContain('command_registry_entry_requires_receiving_site_carrier_admission');
  });

  it('refuses suspicious paths, raw WSL crossings, source result imports, credentials, and bad timeouts', () => {
    const decision = decideWindowsTestRun(buildWindowsTestRunRequest({
      path: 'tools/task-lifecycle/task-next.mjs; wsl.exe whoami',
      timeout_seconds: 301,
      authority_basis: 'fixture',
      source_result_import_requested: true,
      credentials_requested: true,
    }), registry);

    expect(decision.status).toBe('refused');
    expect(decision.refusals).toEqual([
      'source_pass_fail_import_refused',
      'credential_import_refused',
      'timeout_outside_allowed_range',
      'test_path_rejected_suspicious_input',
    ]);
  });

  it('refuses unknown ids and mixed id/path requests', () => {
    const unknown = decideWindowsTestRun(buildWindowsTestRunRequest({
      test_id: 'missing',
      authority_basis: 'fixture',
    }), registry);
    const mixed = decideWindowsTestRun(buildWindowsTestRunRequest({
      test_id: 'shell_mcp',
      path: 'tools/mcp-servers/shell/shell-mcp-server.test.mjs',
      authority_basis: 'fixture',
    }), registry);

    expect(unknown.refusals).toContain('unknown_test_id');
    expect(mixed.refusals).toContain('run_test_accepts_test_id_or_path_not_both');
  });
});
