import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { searchTasksService } from '@narada2/task-governance/task-search-service';

function parseArgs(argv) {
  const args = { positional: [], query: null, status: null, limit: 20 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--query' && i + 1 < argv.length) {
      args.query = argv[i + 1];
      i++;
    } else if (arg === '--status' && i + 1 < argv.length) {
      args.status = argv[i + 1];
      i++;
    } else if (arg === '--limit' && i + 1 < argv.length) {
      const parsed = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed)) args.limit = parsed;
      i++;
    } else if (!arg.startsWith('--')) {
      args.positional.push(arg);
    }
  }
  return args;
}

const parsed = parseArgs(process.argv);
const cwd = parsed.positional[0] || process.cwd();
const query = parsed.query || parsed.positional[1] || null;

if (!query) {
  console.error('Usage: node task-search.mjs <cwd> <query> [--query <query>] [--status <status>] [--limit <n>]');
  process.exit(1);
}

const result = await searchTasksService({ cwd, query, maxSnippets: 3 });
const output = result.result || result;

// Apply status filter post-search if requested
if (parsed.status && output.results) {
  output.results = output.results.filter((r) => r.status === parsed.status);
  output.count = output.results.length;
}

// Apply limit
if (output.results) {
  output.results = output.results.slice(0, parsed.limit);
}

console.log(JSON.stringify(output, null, 2));
process.exit(result.exitCode || 0);
