import { describe, expect, it } from 'vitest';
import {
  DeniedSourceImportError,
  LiveMcpRegistrationNotAdmittedError,
  McpRuntimeAuthorityError,
  NonNeutralIdentityError,
  buildMcpRuntimeBindingRequest,
  buildMcpRuntimeBindingResult,
  decideTaskDbAdapterBoundary,
} from '../src/index.js';
import type { McpRuntimeBindingAuthorityBasis } from '../src/index.js';

const authorityBasis: McpRuntimeBindingAuthorityBasis = {
  siteId: 'narada-proper',
  taskSurfaceId: 'narada-proper.task-0001',
  carrierId: 'narada-proper.carrier.task-0001.package-implementation.v0',
  admittedBy: { identityId: 'narada.architect', role: 'architect' },
  admittedAt: '2026-05-10T18:50:00.000Z',
  liveRegistrationAdmitted: false,
  adapterBoundary: decideTaskDbAdapterBoundary(),
};

describe('MCP runtime binding', () => {
  it('builds an adapter-bound runtime binding request without live registration', () => {
    const request = buildMcpRuntimeBindingRequest({
      siteRoot: 'D:\\code\\narada',
      authorityBasis,
    });

    expect(request.schema).toBe('narada.site_task_lifecycle.mcp_runtime_binding_request.v0');
    expect(request.liveRegistrationRequested).toBe(false);
    expect(request.facade.transport).toBe('descriptor_only');
    expect(request.runtimeTools.map((tool) => tool.toolName)).toEqual([
      'site_task_lifecycle.plan_init',
      'site_task_lifecycle.project_inbox_envelope',
      'site_task_lifecycle.build_task_db_init_plan',
      'site_task_lifecycle.build_task_admission_write_request',
    ]);
    expect(request.runtimeTools[3]?.adapterCapabilitiesRequired.map((capability) => capability.name)).toContain('insert_task_record');
  });

  it('builds a result that does not claim live registration', () => {
    const request = buildMcpRuntimeBindingRequest({
      siteRoot: 'D:\\code\\narada',
      authorityBasis,
    });
    const result = buildMcpRuntimeBindingResult(request, '2026-05-10T18:51:00.000Z');

    expect(result.status).toBe('ready_for_admitted_runtime_surface');
    expect(result.adapterDecision).toBe('adapter_interface_only');
    expect(result.liveRegistrationPerformed).toBe(false);
    expect(result.toolCount).toBe(4);
  });

  it('rejects live registration requests', () => {
    expect(() => buildMcpRuntimeBindingRequest({
      siteRoot: 'D:\\code\\narada',
      authorityBasis,
      liveRegistrationRequested: true,
    })).toThrow(LiveMcpRegistrationNotAdmittedError);
  });

  it('rejects non-Narada-proper authority', () => {
    expect(() => buildMcpRuntimeBindingRequest({
      siteRoot: 'D:\\code\\narada',
      authorityBasis: { ...authorityBasis, siteId: 'narada-andrey' },
    })).toThrow(McpRuntimeAuthorityError);
  });

  it('rejects non-neutral admitting identities', () => {
    expect(() => buildMcpRuntimeBindingRequest({
      siteRoot: 'D:\\code\\narada',
      authorityBasis: {
        ...authorityBasis,
        admittedBy: { identityId: 'narada-andrey.Kevin', role: 'architect' },
      },
    })).toThrow(NonNeutralIdentityError);
  });

  it('rejects denied source refs before runtime binding handoff', () => {
    expect(() => buildMcpRuntimeBindingRequest({
      siteRoot: 'D:\\code\\narada',
      authorityBasis,
      sourceImportRefs: ['C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db'],
    })).toThrow(DeniedSourceImportError);
  });
});
