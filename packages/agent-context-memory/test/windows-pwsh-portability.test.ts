import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAgentContextSchemaInitPlan,
  buildCapabilityRegistryFragment,
  buildMcpRegistrationDescriptor,
  findDeniedSourceImports,
} from '../src/index.js';

describe('Windows PowerShell package portability', () => {
  it('documents future Site consumption from repo package without live state copying', async () => {
    const doc = await readFile(join(process.cwd(), 'docs', 'windows-pwsh-consuming-site.md'), 'utf8');

    expect(doc).toContain('Future Windows PowerShell Narada Sites');
    expect(doc).toContain('pnpm --dir "$RepoRoot\\packages\\agent-context-memory" build');
    expect(doc).toContain('Do not copy');
    expect(doc).toContain('.ai/state/agent-context.sqlite');
  });

  it('lets a future Site assemble descriptors without importing Narada proper or andrey-user state', () => {
    const schemaPlan = buildAgentContextSchemaInitPlan();
    const mcp = buildMcpRegistrationDescriptor();
    const capability = buildCapabilityRegistryFragment();
    const findings = findDeniedSourceImports([
      'D:\\code\\narada\\.narada\\checkpoints\\2026-05-10-task-0008-agent-thread-checkpoint.md',
      'C:\\Users\\Andrey\\Narada\\.ai\\state\\agent-context.sqlite',
    ]);

    expect(schemaPlan.packageExecutesSqliteMutation).toBe(false);
    expect(mcp.transport).toBe('descriptor_only');
    expect(capability.capabilityFamily).toBe('agent_context_memory');
    expect(findings.map((finding) => finding.reason)).toEqual([
      'source checkpoint history',
      'source agent-context database',
    ]);
  });
});
