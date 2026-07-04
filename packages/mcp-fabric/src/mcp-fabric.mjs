import { fileURLToPath } from 'node:url';
export { McpFabricError } from './mcp-fabric-errors.mjs';
export { loadSiteMcpFabric } from './mcp-fabric-loader.mjs';
export { runMcpFabricDoctor, renderMcpFabricDoctorTable } from './mcp-fabric-doctor.mjs';
export { codexMcpEnvVarNames, projectFabricForAgentTui, projectFabricForClaudeCode, projectFabricForCodex, projectServerEnvironment, mcpServerNames } from './mcp-fabric-projection.mjs';

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

function parseDoctorCliArgs(argv) {
  const parsed = { siteRoot: null, timeoutMs: 5000, json: false };
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

  const { runMcpFabricDoctor, renderMcpFabricDoctorTable } = await import('./mcp-fabric-doctor.mjs');
  const report = await runMcpFabricDoctor(siteRoot, { timeoutMs });
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderMcpFabricDoctorTable(report)}\n`);
  }
  process.exit(report.summary?.healthy === false ? 1 : 0);
}
