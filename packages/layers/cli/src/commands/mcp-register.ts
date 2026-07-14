import type { CommanderOptionValues } from '../lib/command-wrapper.js';
import type { Command } from 'commander';
import { runMcpServer } from '../mcp-server.js';

export function registerMcpCommands(program: Command): void {
  const mcpCmd = program
    .command('mcp')
    .description('MCP facade operators');

  mcpCmd
    .command('serve')
    .description('Serve a Site-scoped Narada MCP facade over stdio')
    .option('--site-root <path>', 'Site root path; defaults to cwd')
    .option('--site-id <id>', 'Explicit Site id when config.json is unavailable')
    .option('--site-kind <kind>', 'Explicit Site kind when config.json is unavailable')
    .option('--cwd <path>', 'Working directory fallback for Site root resolution')
    .action(async (opts: CommanderOptionValues) => {
      await runMcpServer({
        siteRoot: opts.siteRoot as string | undefined,
        siteId: opts.siteId as string | undefined,
        siteKind: opts.siteKind as string | undefined,
        cwd: opts.cwd as string | undefined,
      });
    });
}
