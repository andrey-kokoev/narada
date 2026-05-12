import { describe, expect, it } from 'vitest';
import { buildWindowsTestEvidencePayload, buildWindowsTestTargetDescriptor } from '../src/index.js';

describe('windows test MCP descriptors', () => {
  it('describes approved targets without importing source pass/fail state', () => {
    const target = buildWindowsTestTargetDescriptor({
      target_id: 'fixture.node.unit',
      kind: 'node',
      command_descriptor: 'pnpm test',
      allowed_by_policy_ref: 'policy.fixture',
    });
    const evidence = buildWindowsTestEvidencePayload(target.target_id);

    expect(target.source_pass_fail_imported).toBe(false);
    expect(evidence.receiving_site_generated).toBe(true);
    expect(evidence.status).toBe('planned');
  });
});
