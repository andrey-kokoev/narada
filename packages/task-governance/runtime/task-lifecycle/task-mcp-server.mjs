#!/usr/bin/env node
const message = 'retired_task_lifecycle_mcp_entrypoint: @narada2/task-governance/task-lifecycle-mcp-server has moved to @narada2/task-lifecycle-mcp. Use command: task-lifecycle-mcp --site-root <path>.';

if (process.argv[1]) {
  console.error(message);
  process.exit(64);
}

throw new Error(message);
