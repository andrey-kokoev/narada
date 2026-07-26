import { fileURLToPath } from 'node:url';
export { McpFabricError } from './mcp-fabric-errors.js';
export { loadSiteMcpFabric } from './mcp-fabric-loader.js';
export { runMcpFabricDoctor, renderMcpFabricDoctorTable } from './mcp-fabric-doctor.js';
export {
  MCP_FABRIC_RUNTIME_LIFECYCLE_SCHEMA,
  MCP_FABRIC_RUNTIME_STATES,
  canTransitionMcpFabricRuntime,
  createMcpFabricRuntimeLifecycle,
  assertMcpFabricRuntimeTransition,
  transitionMcpFabricRuntime,
} from './mcp-fabric-runtime-state.js';
export { codexMcpEnvVarNames, projectFabricForAgentTui, projectFabricForClaudeCode, projectFabricForCodex, projectServerEnvironment, mcpServerNames } from './mcp-fabric-projection.js';

function isMainModule(): boolean {
  return Boolean(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]);
}

function parseDoctorCliArgs(argv: string[]): { siteRoot: string | null; timeoutMs: number; json: boolean } {
  const parsed: { siteRoot: string | null; timeoutMs: number; json: boolean } = { siteRoot: null, timeoutMs: 5000, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--site-root' && argv[i + 1]) {
      parsed.siteRoot = argv[i + 1];
      i += 1;
    } else if (arg === '--timeout-ms' && argv[i + 1]) {
      parsed.timeoutMs = Number(argv[i + 1]);
      i += 1;
    }
  }
  return parsed;
}

if (isMainModule()) {
  const { siteRoot, timeoutMs, json } = parseDoctorCliArgs(process.argv.slice(2));
  if (!siteRoot) {
    console.error('Usage: mcp-fabric --site-root <path> [--timeout-ms <ms>] [--json]');
    process.exit(2);
  }

  const { runMcpFabricDoctor, renderMcpFabricDoctorTable } = await import('./mcp-fabric-doctor.js');
  const report = await runMcpFabricDoctor(siteRoot, { timeoutMs });
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderMcpFabricDoctorTable(report)}\n`);
  }
  process.exit(report.summary?.healthy === false ? 1 : 0);
}
