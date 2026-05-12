export type WindowsShellToolName =
  | 'execute_command'
  | 'normalize_line_endings'
  | 'git_stage_paths'
  | 'git_commit'
  | 'git_push_current'
  | 'git_commit_and_push_increment'
  | 'git_task_closeout_commit_and_push'
  | 'git_closeout_preflight'
  | 'git_handoff_inbox_envelope_export';

export type WindowsMcpOwnership =
  | 'filesystem_mcp_preferred'
  | 'shell_mcp_allowed_descriptor'
  | 'shell_mcp_git_tool_required'
  | 'domain_mcp_required'
  | 'refused';

export interface WindowsShellBoundaryRequest {
  schema: 'narada.mcp_shell_windows.boundary_request.v0';
  tool_name: WindowsShellToolName;
  command?: string;
  working_directory: string;
  authority_basis?: string;
  target_domain?: 'repo_text' | 'git' | 'task_lifecycle' | 'inbox' | 'operator_surface' | 'test' | 'process';
  source_site_import_requested?: boolean;
  credentials_requested?: boolean;
}

export interface WindowsShellBoundaryDecision {
  schema: 'narada.mcp_shell_windows.boundary_decision.v0';
  ownership: WindowsMcpOwnership;
  refusals: string[];
  warnings: string[];
  audit_required: true;
  live_shell_authority_granted: false;
  executed: false;
}

export function buildWindowsShellBoundaryRequest(input: Omit<WindowsShellBoundaryRequest, 'schema'>): WindowsShellBoundaryRequest {
  return {
    schema: 'narada.mcp_shell_windows.boundary_request.v0',
    ...input,
  };
}

export function decideWindowsShellBoundary(request: WindowsShellBoundaryRequest): WindowsShellBoundaryDecision {
  const refusals: string[] = [];
  const warnings: string[] = [];

  if (containsRawWslCrossing(request.command) || containsRawWslCrossing(request.working_directory)) {
    refusals.push('raw_wsl_crossing_refused');
  }
  if (containsDestructiveProcessKill(request.command)) {
    refusals.push('arbitrary_process_kill_refused');
  }
  if (request.source_site_import_requested) {
    refusals.push('source_site_runtime_import_refused');
  }
  if (request.credentials_requested) {
    refusals.push('credential_import_refused');
  }

  let ownership = classifyOwnership(request);
  if (refusals.length > 0) ownership = 'refused';

  if (request.tool_name === 'execute_command' && request.target_domain === 'repo_text') {
    warnings.push('filesystem_mcp_should_handle_repo_text_reads_and_writes');
  }

  return {
    schema: 'narada.mcp_shell_windows.boundary_decision.v0',
    ownership,
    refusals,
    warnings,
    audit_required: true,
    live_shell_authority_granted: false,
    executed: false,
  };
}

function classifyOwnership(request: WindowsShellBoundaryRequest): WindowsMcpOwnership {
  if (request.target_domain === 'task_lifecycle' || request.target_domain === 'inbox' || request.target_domain === 'operator_surface') {
    return 'domain_mcp_required';
  }
  if (request.tool_name.startsWith('git_') || request.tool_name === 'git_commit' || request.tool_name === 'git_push_current') {
    return 'shell_mcp_git_tool_required';
  }
  if (request.tool_name === 'normalize_line_endings') {
    return 'shell_mcp_allowed_descriptor';
  }
  if (request.target_domain === 'repo_text') {
    return 'filesystem_mcp_preferred';
  }
  return 'shell_mcp_allowed_descriptor';
}

function containsRawWslCrossing(value: string | undefined): boolean {
  return /\bwsl(?:\.exe)?\b/i.test(value ?? '');
}

function containsDestructiveProcessKill(value: string | undefined): boolean {
  const command = value ?? '';
  return (
    /\bGet-Process\s+(kimi|codex)(\.exe)?\b[\s\S]*\|\s*Stop-Process\b/i.test(command) ||
    /\bStop-Process\b[\s\S]*\b(kimi|codex)(\.exe)?\b/i.test(command) ||
    /\btaskkill\b[\s\S]*\b(kimi|codex)(\.exe)?\b/i.test(command)
  );
}
