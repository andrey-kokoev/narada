import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { auditSiteFabric } from './site-fabric-audit.mjs';
import {
  buildMcpSurfaceRegistry,
  deriveSiteId,
  inferredToolContract,
  writeMcpSurfaceRegistry,
} from './generate-mcp-surface-registry.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'narada-generate-mcp-registry-'));
const siteRoot = join(workspace, 'client-site', '.narada');
mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
writeFileSync(join(siteRoot, '.ai', 'mcp', 'with-id-mcp.json'), `${JSON.stringify({
  mcpServers: {
    'with-id': {
      command: 'node',
      args: ['server.mjs'],
      surface_id: 'with-id.surface',
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(siteRoot, '.ai', 'mcp', 'without-id-mcp.json'), `${JSON.stringify({
  mcpServers: {
    'without-id': {
      command: 'node',
      args: ['server.mjs'],
    },
  },
}, null, 2)}\n`, 'utf8');

const registry = buildMcpSurfaceRegistry(siteRoot, { generatedAt: '2026-01-01T00:00:00.000Z' });
assert.equal(registry.schema, 'narada.site.capabilities.mcp_surfaces.v1');
assert.equal(registry.site_id, 'client-site');
assert.equal(registry.surfaces.length, 2);
assert.deepEqual(registry.surfaces.map((surface) => surface.surface_id).sort(), ['with-id.surface', 'without-id.local']);
assert.equal(registry.surfaces.every((surface) => surface.tool_contract.read_only_tools.length === 0), true);
assert.equal(registry.surfaces.every((surface) => surface.authority_boundary.grants_tool_authority === false), true);
assert.deepEqual(inferredToolContract('fixture-agent-context').read_only_tools, [
  'agent_context_doctor',
  'agent_context_whoami',
  'agent_context_hydrate_current',
  'agent_context_startup_sequence',
  'agent_context_rehydrate',
  'agent_context_list_sessions',
]);
assert.equal(inferredToolContract('fixture-task-lifecycle').read_only_tools.includes('task_lifecycle_next'), true);
assert.equal(inferredToolContract('fixture-task-lifecycle').mutating_tools.includes('task_lifecycle_claim'), true);
assert.equal(inferredToolContract('fixture-task-lifecycle').mutating_tools.includes('task_lifecycle_run_tests'), true);
assert.equal(deriveSiteId(siteRoot), 'client-site');

const result = writeMcpSurfaceRegistry(join(workspace, 'client-site'), { generatedAt: '2026-01-01T00:00:00.000Z' });
assert.equal(result.status, 'ok');
assert.equal(result.surface_count, 2);
assert.equal(existsSync(result.registry_path), true);
const written = JSON.parse(readFileSync(result.registry_path, 'utf8'));
assert.equal(written.surfaces.length, 2);

const audit = auditSiteFabric(join(workspace, 'client-site'));
assert.equal(audit.registry.status, 'loaded');
assert.equal(audit.strict_validation.status, 'ok');
assert.equal(audit.authoritative_server_count, 2);
assert.equal(audit.recommendation, 'ok');

rmSync(workspace, { recursive: true, force: true });
console.log('generate-mcp-surface-registry tests PASSED.');
