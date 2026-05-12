import { describe, expect, it } from 'vitest';
import { buildWindowsShellBoundaryRequest, decideWindowsShellBoundary } from '../src/index.js';

describe('windows shell MCP boundary descriptors', () => {
  it('prefers filesystem MCP for repo text reads without executing shell', () => {
    const decision = decideWindowsShellBoundary(buildWindowsShellBoundaryRequest({
      tool_name: 'execute_command',
      command: 'Get-Content README.md',
      working_directory: '.',
      target_domain: 'repo_text',
      authority_basis: 'fixture',
    }));

    expect(decision.ownership).toBe('filesystem_mcp_preferred');
    expect(decision.executed).toBe(false);
    expect(decision.live_shell_authority_granted).toBe(false);
    expect(decision.warnings).toContain('filesystem_mcp_should_handle_repo_text_reads_and_writes');
  });

  it('requires explicit shell MCP git tools for git mutation descriptors', () => {
    const decision = decideWindowsShellBoundary(buildWindowsShellBoundaryRequest({
      tool_name: 'git_task_closeout_commit_and_push',
      working_directory: '.',
      target_domain: 'git',
      authority_basis: 'task_closeout_policy',
    }));

    expect(decision.ownership).toBe('shell_mcp_git_tool_required');
    expect(decision.audit_required).toBe(true);
    expect(decision.refusals).toEqual([]);
  });

  it('routes task lifecycle and operator-surface mutations to domain MCP surfaces', () => {
    const taskDecision = decideWindowsShellBoundary(buildWindowsShellBoundaryRequest({
      tool_name: 'execute_command',
      command: 'narada task close 123',
      working_directory: '.',
      target_domain: 'task_lifecycle',
      authority_basis: 'fixture',
    }));
    const surfaceDecision = decideWindowsShellBoundary(buildWindowsShellBoundaryRequest({
      tool_name: 'execute_command',
      command: 'narada operator-surface bind-focused --as self',
      working_directory: '.',
      target_domain: 'operator_surface',
      authority_basis: 'fixture',
    }));

    expect(taskDecision.ownership).toBe('domain_mcp_required');
    expect(surfaceDecision.ownership).toBe('domain_mcp_required');
  });

  it('refuses raw WSL crossings, process kills, source imports, and credentials', () => {
    const decision = decideWindowsShellBoundary(buildWindowsShellBoundaryRequest({
      tool_name: 'execute_command',
      command: 'wsl.exe bash -lc "taskkill /IM codex.exe /F"',
      working_directory: '.',
      target_domain: 'process',
      authority_basis: 'fixture',
      source_site_import_requested: true,
      credentials_requested: true,
    }));

    expect(decision.ownership).toBe('refused');
    expect(decision.refusals).toEqual([
      'raw_wsl_crossing_refused',
      'arbitrary_process_kill_refused',
      'source_site_runtime_import_refused',
      'credential_import_refused',
    ]);
  });
});
