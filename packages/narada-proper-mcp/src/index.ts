import { fileURLToPath } from 'node:url';
import { runMcpServer, type McpServerOptions } from './server.js';

export interface NaradaProperMcpArgs {
  cwd?: string;
  siteRoot?: string;
  siteId?: string;
  siteKind?: string;
  agentId?: string;
  agentRole?: string;
  agentStartEventId?: string;
  carrierSessionId?: string;
  agentContextDb?: string;
  help?: boolean;
}

export const NARADA_PROPER_MCP_SURFACE = {
  schema: 'narada.mcp_surface.v0',
  surface_id: 'narada-proper.surface.agent-facing-mcp.v1',
  package_name: '@narada2/narada-proper-mcp',
  command_name: 'narada-proper-mcp',
  authority_posture: 'target_local_agent_facing_mcp',
  source_site_runtime_imported: false,
  compatibility_facade_replaced: 'narada-mcp',
};

export function parseNaradaProperMcpArgs(args: string[]): NaradaProperMcpArgs {
  const options: NaradaProperMcpArgs = {};
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
    } else if (arg === '--agent-id' && next) {
      options.agentId = next;
      i += 1;
    } else if (arg === '--agent-role' && next) {
      options.agentRole = next;
      i += 1;
    } else if (arg === '--agent-start-event-id' && next) {
      options.agentStartEventId = next;
      i += 1;
    } else if (arg === '--carrier-session-id' && next) {
      options.carrierSessionId = next;
      i += 1;
    } else if (arg === '--agent-context-db' && next) {
      options.agentContextDb = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }
  return options;
}

export function usage(): string {
  return [
    'Usage: narada-proper-mcp [--site-root <path>] [--site-id <id>] [--site-kind <kind>] [--cwd <path>]',
    '                         [--agent-id <id>] [--agent-role <role>] [--agent-start-event-id <id>]',
    '                         [--carrier-session-id <id>] [--agent-context-db <path>]',
  ].join('\n');
}

export async function runNaradaProperMcp(options: McpServerOptions): Promise<void> {
  await runMcpServer(options);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseNaradaProperMcpArgs(argv);
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  await runNaradaProperMcp(parsed);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
