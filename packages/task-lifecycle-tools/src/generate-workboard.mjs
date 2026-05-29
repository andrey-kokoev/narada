import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { buildUnifiedWorkboard } from './unified-workboard.mjs';
import { resolveAgentRole } from './agent-role-resolution.mjs';

function parseArgs(argv) {
  const args = { cwd: null, limit: 8, agent: null, since: null, offset: 0 };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--agent' && i + 1 < argv.length) {
      args.agent = argv[i + 1];
      i++;
    } else if (arg === '--limit' && i + 1 < argv.length) {
      const parsed = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed)) args.limit = parsed;
      i++;
    } else if (arg === '--since' && i + 1 < argv.length) {
      args.since = argv[i + 1];
      i++;
    } else if (arg === '--offset' && i + 1 < argv.length) {
      const parsed = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed)) args.offset = parsed;
      i++;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }
  // Positional: [<cwd>] [<limit-or-agent>] [<agent>]
  if (positional.length >= 1) {
    args.cwd = positional[0];
  }
  if (positional.length >= 2) {
    const second = positional[1];
    const parsed = parseInt(second, 10);
    if (!Number.isNaN(parsed) && String(parsed) === second) {
      args.limit = parsed;
    } else {
      args.agent = second;
    }
  }
  if (positional.length >= 3) {
    args.agent = positional[2];
  }
  return args;
}

let { cwd, limit, agent, since, offset } = parseArgs(process.argv);
if (!cwd) cwd = process.cwd();

const store = openTaskLifecycleStore(cwd);

// Get agent role if specified
let agentRole = null;
if (agent) {
  agentRole = resolveAgentRole(store, cwd, agent);
}

try {
  const all = store.getAllLifecyclePaginated({ since, offset });
  const result = buildUnifiedWorkboard({ store, siteRoot: cwd, agentId: agent, agentRole, allTasks: all, limit });
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.db.close();
}
