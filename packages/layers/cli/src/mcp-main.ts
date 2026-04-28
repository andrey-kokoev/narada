#!/usr/bin/env node
import { runMcpServer } from './mcp-server.js';

runMcpServer(parseArgs(process.argv.slice(2))).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

function parseArgs(args: string[]): { cwd?: string; siteRoot?: string; siteId?: string; siteKind?: string } {
  const options: { cwd?: string; siteRoot?: string; siteId?: string; siteKind?: string } = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--cwd' && next) {
      options.cwd = next;
      i += 1;
    } else if (arg === '--site-root' && next) {
      options.siteRoot = next;
      i += 1;
    } else if (arg === '--site-id' && next) {
      options.siteId = next;
      i += 1;
    } else if (arg === '--site-kind' && next) {
      options.siteKind = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: narada-mcp [--site-root <path>] [--site-id <id>] [--site-kind <kind>] [--cwd <path>]\\n');
      process.exit(0);
    }
  }
  return options;
}
