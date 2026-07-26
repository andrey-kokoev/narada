/**
 * MCP Guard: Prevent agents from bypassing the MCP facade and calling CLI tools directly.
 *
 * When NARADA_AGENT_ID is set, CLI tools refuse to run and direct the agent to use MCP.
 * Human operators and CI can bypass with --bypass-mcp-guard in emergencies.
 */

export function enforceMcpGuard(argv: any) : any {
  if (argv.includes('--bypass-mcp-guard')) {
    return { bypassed: true };
  }

  const agentId: any = process.env.NARADA_AGENT_ID;
  if (agentId) {
    const toolName: any = process.argv[1]?.split(/[\\/]/).pop() || 'this tool';
    const mcpEquivalent: any = guessMcpTool(toolName);

    console.error(JSON.stringify({
      status: 'error',
      error: 'mcp_guard_violation',
      agent_id: agentId,
      tool: toolName,
      message: `Agent ${agentId} attempted to invoke ${toolName} directly. Agents MUST use the MCP server.`,
      mcp_equivalent: mcpEquivalent,
      remediation: `Use task_mcp_${mcpEquivalent} via the MCP server instead. If this is an emergency, pass --bypass-mcp-guard.`,
    }, null, 2));
    process.exit(1);
  }

  return { bypassed: false };
}

function guessMcpTool(toolName: any) : any {
  const map: any = {
    'task-claim.ts': 'claim',
    'task-unclaim.ts': 'unclaim',
    'task-finish.ts': 'finish',
    'task-review.ts': 'review',
    'task-continue.ts': 'continue',
    'task-close.ts': 'close',
    'task-report.ts': 'submit_observation',
    'task-list.ts': 'list',
    'task-read.ts': 'show',
    'task-obligations.ts': 'obligations',
    'task-admin.ts': 'doctor',
    'task-inspect.ts': 'inspect',
    'generate-workboard.ts': 'next',
    'sync-roster.ts': 'roster',
    'sync-task-roles.ts': 'roster',
  };
  return map[toolName] || 'doctor';
}
