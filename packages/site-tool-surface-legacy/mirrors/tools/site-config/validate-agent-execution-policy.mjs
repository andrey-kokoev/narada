#!/usr/bin/env node
import { validateAgentExecutionPolicy } from './agent-execution-policy.mjs';

const args = parseArgs(process.argv.slice(2));
const result = validateAgentExecutionPolicy(args.siteRoot ?? process.cwd());

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${result.status}: ${result.allowlist_entry_count}/${result.declared_mcp_entrypoint_count} MCP entrypoints allowlisted\n`);
  for (const error of result.errors) process.stdout.write(`ERROR ${error}\n`);
  for (const residual of result.residuals) process.stdout.write(`RESIDUAL ${residual}\n`);
}

process.exit(result.status === 'error' ? 1 : 0);

function parseArgs(argv) {
  const parsed = { json: false, siteRoot: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root') { parsed.siteRoot = argv[++i]; continue; }
    if (arg === '--json') { parsed.json = true; continue; }
    throw new Error(`unknown_arg: ${arg}`);
  }
  return parsed;
}
