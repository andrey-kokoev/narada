import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNarsCapabilityGateway } from './capability-gateway.mjs';

for (const mode of ['exit', 'timeout', 'malformed']) {
  test(`real MCP transport reports ${mode} failure after bounded retry`, async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), `nars-mcp-${mode}-`));
    const mcpDir = join(siteRoot, '.ai', 'mcp'); mkdirSync(mcpDir, { recursive: true });
    const fixture = fileURLToPath(new URL('./fixtures/mcp-failure-fixture.mjs', import.meta.url));
    writeFileSync(join(mcpDir, 'fixture.json'), JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [fixture, mode], request_timeout_ms: 40, startup_timeout_sec: 2 } } }), 'utf8');
    const evidence = [];
    const gateway = createNarsCapabilityGateway({ siteRoot, ownershipContext: { request_timeout_ms: 40 }, recordEvidence: (event) => evidence.push(event) });
    try {
      await gateway.start();
      const result = await gateway.invoke({ toolName: 'fixture_tool', arguments: {} });
      assert.equal(result.status, 'failed');
      assert.ok(evidence.some((event) => event.kind === 'tool_execution_failed'));
    } finally {
      await gateway.close(); rmSync(siteRoot, { recursive: true, force: true });
    }
  });
}
