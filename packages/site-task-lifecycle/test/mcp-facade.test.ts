import { describe, expect, it } from 'vitest';
import { createSiteTaskLifecycleMcpFacadeBinding } from '../src/index.js';

describe('MCP facade binding', () => {
  it('describes package-local tools without admitting live registration', () => {
    const binding = createSiteTaskLifecycleMcpFacadeBinding('D:\\code\\narada');

    expect(binding.schema).toBe('narada.site_task_lifecycle.mcp_facade_binding.v0');
    expect(binding.transport).toBe('descriptor_only');
    expect(binding.tools.map((tool) => tool.name)).toEqual([
      'site_task_lifecycle.plan_init',
      'site_task_lifecycle.project_inbox_envelope',
      'site_task_lifecycle.build_task_db_init_plan',
      'site_task_lifecycle.build_task_admission_write_request',
    ]);
    expect(binding.deniedLiveEffects).toContain('live MCP transport registration');
    expect(binding.deniedLiveEffects).toContain('source inbox database import');
  });
});
