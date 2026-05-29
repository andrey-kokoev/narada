/**
 * MCP Guard: Prevent agents from bypassing the MCP facade and calling CLI tools directly.
 *
 * When NARADA_AGENT_ID is set, CLI tools refuse to run and direct the agent to use MCP.
 * Human operators and CI can bypass with --bypass-mcp-guard in emergencies.
 */

export function enforceMcpGuard(argv) {
  if (argv.includes('--bypass-mcp-guard')) {
    return { bypassed: true };
  }

  const agentId = process.env.NARADA_AGENT_ID;
  if (agentId) {
    const toolName = process.argv[1]?.split(/[\\/]/).pop() || 'this tool';
    const mcpEquivalent = guessMcpTool(toolName);

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

function guessMcpTool(toolName) {
  const map = {
    'task-claim.mjs': 'claim',
    'task-unclaim.mjs': 'unclaim',
    'task-finish.mjs': 'finish',
    'task-review.mjs': 'review',
    'task-continue.mjs': 'continue',
    'task-close.mjs': 'close',
    'task-report.mjs': 'submit_observation',
    'task-list.mjs': 'list',
    'task-read.mjs': 'show',
    'task-obligations.mjs': 'obligations',
    'task-admin.mjs': 'doctor',
    'task-inspect.mjs': 'inspect',
    'generate-workboard.mjs': 'next',
    'sync-roster.mjs': 'roster',
    'sync-task-roles.mjs': 'roster',
  };
  return map[toolName] || 'doctor';
}
