import type { McpSurfaceCarrierStatusInput } from '../../src/index.js';

export const staleSurfaceFixture: McpSurfaceCarrierStatusInput = {
  siteAuthority: {
    siteId: 'neutral-site',
    authorityRoot: 'D:\\Sites\\neutral',
    authorityEvidenceRefs: ['evidence:neutral-site-authority'],
  },
  mcpProcess: {
    surfaceId: 'site_task_lifecycle',
    transport: 'stdio',
    processIdentity: 'mcp-process:neutral-stale',
    sourceVersionRef: 'source:v2',
    baselineVersionRef: 'source:v1',
  },
  carrierSession: {
    carrierId: 'carrier:neutral',
    status: 'stale',
    evidenceRefs: ['evidence:carrier-stale'],
  },
  runtimeRegistry: {
    registryId: 'runtime-registry:neutral',
    surfaceRegistered: true,
    mcpExposed: false,
    evidenceRefs: ['evidence:registry-observed'],
  },
  capability: {
    capabilityId: 'capability:site-task-lifecycle-mcp',
    state: 'blocked',
    exposureClass: 'read_only',
  },
  sourceNewerThanBaseline: true,
  restartRequest: {
    requestId: 'restart-request:neutral',
    reason: 'source_newer_than_baseline',
    evidenceRefs: ['evidence:restart-pressure'],
    executed: false,
  },
};

export const liveVerifiedSurfaceFixture: McpSurfaceCarrierStatusInput = {
  siteAuthority: {
    siteId: 'neutral-site',
    authorityRoot: 'D:\\Sites\\neutral',
    authorityEvidenceRefs: ['evidence:neutral-site-authority'],
  },
  mcpProcess: {
    surfaceId: 'site_task_lifecycle',
    transport: 'stdio',
    processIdentity: 'mcp-process:neutral-live',
    sourceVersionRef: 'source:v2',
    baselineVersionRef: 'source:v2',
  },
  carrierSession: {
    carrierId: 'carrier:neutral',
    sessionId: 'session:neutral-live',
    status: 'bound',
    evidenceRefs: ['evidence:carrier-bound'],
  },
  runtimeRegistry: {
    registryId: 'runtime-registry:neutral',
    surfaceRegistered: true,
    mcpExposed: true,
    evidenceRefs: ['evidence:registry-live'],
  },
  capability: {
    capabilityId: 'capability:site-task-lifecycle-mcp',
    state: 'mcp_exposed',
    exposureClass: 'read_only',
  },
  verification: {
    kind: 'smoke_call',
    live: true,
    evidenceRefs: ['evidence:smoke-call-plan-init'],
  },
};
