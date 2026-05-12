import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAgentContextSchemaInitPlan,
  buildCapabilityRegistryFragment,
  buildCheckpointDescriptor,
  buildHydrationRequestDescriptor,
  buildMcpRegistrationDescriptor,
} from '../src/index.js';

describe('agent-context descriptor surfaces', () => {
  it('builds SQLite schema descriptors without package mutation ownership', () => {
    const plan = buildAgentContextSchemaInitPlan();

    expect(plan.storage).toBe('sqlite_descriptor_only');
    expect(plan.packageOwnsSqliteDependency).toBe(false);
    expect(plan.packageExecutesSqliteMutation).toBe(false);
    expect(plan.statements.map((statement) => statement.id)).toEqual([
      'named_agents',
      'agent_sessions',
      'agent_checkpoints',
      'hydration_events',
    ]);
    expect(plan.statements.every((statement) => statement.mutating === false)).toBe(true);
  });

  it('builds checkpoint and hydration descriptors without runtime execution', () => {
    const checkpoint = buildCheckpointDescriptor({
      checkpointId: 'checkpoint-neutral-001',
      sessionId: 'sess-neutral-001',
      namedAgentId: 'site-alpha.agent.kevin',
      summary: 'Neutral checkpoint summary.',
      evidenceRefs: ['task:neutral'],
      capturedAt: '2026-05-10T00:00:00.000Z',
    });
    const hydration = buildHydrationRequestDescriptor({
      hydrationId: 'hydrate-neutral-001',
      namedAgentId: checkpoint.namedAgentId,
      checkpointRefs: [checkpoint.checkpointId],
      requestedBy: 'site-alpha.operator',
    });

    expect(checkpoint.persistedByPackage).toBe(false);
    expect(hydration.mode).toBe('descriptor_only');
    expect(hydration.executedByPackage).toBe(false);
  });

  it('builds MCP and capability fragments as descriptor-only surfaces', () => {
    const mcp = buildMcpRegistrationDescriptor();
    const capabilities = buildCapabilityRegistryFragment();

    expect(mcp.liveRegistrationPerformed).toBe(false);
    expect(mcp.tools.map((tool) => tool.name)).toContain('agent_context_memory.plan_hydration');
    expect(capabilities.capabilities).toContainEqual({
      capability: 'live_storage_adapter',
      posture: 'requires_local_admission',
    });
    expect(capabilities.deniedCapabilities).toContain('claimed-identity authority');
  });

  it('keeps package metadata free of SQLite runtime dependencies', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const dependencies = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
    ]);

    expect(dependencies.has('sqlite3')).toBe(false);
    expect(dependencies.has('better-sqlite3')).toBe(false);
    expect(dependencies.has('@libsql/client')).toBe(false);
  });
});
