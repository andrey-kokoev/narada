import { createHash } from 'node:crypto';
import {
  DeniedSourceImportError,
  assertNeutralIdentities,
  findDeniedSourceImports,
} from './import-refusal.js';
import { createSiteTaskLifecycleMcpFacadeBinding } from './mcp-facade.js';
import type {
  McpRuntimeBindingRequest,
  McpRuntimeBindingRequestOptions,
  McpRuntimeBindingResult,
  McpRuntimeToolBinding,
  TaskDbAdapterCapability,
} from './types.js';

const PACKAGE_NAME = '@narada2/site-task-lifecycle';

export class McpRuntimeAuthorityError extends Error {
  constructor(reason: string) {
    super(`MCP runtime binding authority rejected: ${reason}`);
    this.name = 'McpRuntimeAuthorityError';
  }
}

export class LiveMcpRegistrationNotAdmittedError extends Error {
  constructor() {
    super('Live MCP registration is not admitted by this package surface');
    this.name = 'LiveMcpRegistrationNotAdmittedError';
  }
}

export function buildMcpRuntimeBindingRequest(
  options: McpRuntimeBindingRequestOptions,
): McpRuntimeBindingRequest {
  if (options.liveRegistrationRequested) {
    throw new LiveMcpRegistrationNotAdmittedError();
  }

  validateAuthorityBasis(options);

  const sourceImportFindings = findDeniedSourceImports(options.sourceImportRefs ?? []);
  if (sourceImportFindings.length > 0) {
    throw new DeniedSourceImportError(sourceImportFindings);
  }

  return {
    schema: 'narada.site_task_lifecycle.mcp_runtime_binding_request.v0',
    packageName: PACKAGE_NAME,
    siteRoot: options.siteRoot,
    authorityBasis: options.authorityBasis,
    facade: createSiteTaskLifecycleMcpFacadeBinding(options.siteRoot),
    runtimeTools: buildRuntimeToolBindings(options.authorityBasis.adapterBoundary.requiredAdapterCapabilities),
    sourceImportFindings,
    liveRegistrationRequested: false,
  };
}

export function buildMcpRuntimeBindingResult(
  request: McpRuntimeBindingRequest,
  recordedAt: string,
): McpRuntimeBindingResult {
  const bindingId = createHash('sha256')
    .update(`${request.authorityBasis.taskSurfaceId}\n${request.siteRoot}\n${request.packageName}`)
    .digest('hex')
    .slice(0, 16);

  return {
    schema: 'narada.site_task_lifecycle.mcp_runtime_binding_result.v0',
    bindingId: `mcp-runtime-binding-${bindingId}`,
    status: 'ready_for_admitted_runtime_surface',
    packageName: request.packageName,
    siteRoot: request.siteRoot,
    toolCount: request.runtimeTools.length,
    adapterDecision: request.authorityBasis.adapterBoundary.decision,
    liveRegistrationPerformed: false,
    recordedAt,
  };
}

function validateAuthorityBasis(options: McpRuntimeBindingRequestOptions): void {
  const { authorityBasis } = options;
  assertNeutralIdentities([authorityBasis.admittedBy]);

  if (authorityBasis.siteId !== 'narada-proper') {
    throw new McpRuntimeAuthorityError(`expected narada-proper site authority, got ${authorityBasis.siteId}`);
  }
  if (!authorityBasis.taskSurfaceId.startsWith('narada-proper.task-')) {
    throw new McpRuntimeAuthorityError(`unexpected task surface: ${authorityBasis.taskSurfaceId}`);
  }
  if (!authorityBasis.carrierId.startsWith('narada-proper.carrier.')) {
    throw new McpRuntimeAuthorityError(`unexpected carrier: ${authorityBasis.carrierId}`);
  }
  if (authorityBasis.liveRegistrationAdmitted !== false) {
    throw new LiveMcpRegistrationNotAdmittedError();
  }
  if (authorityBasis.adapterBoundary.decision !== 'adapter_interface_only') {
    throw new McpRuntimeAuthorityError(`unexpected adapter decision: ${authorityBasis.adapterBoundary.decision}`);
  }
  if (authorityBasis.adapterBoundary.packageOwnsSqliteDependency || authorityBasis.adapterBoundary.packageExecutesSqliteMutation) {
    throw new McpRuntimeAuthorityError('adapter boundary must not admit package-owned SQLite dependency or mutation');
  }
}

function buildRuntimeToolBindings(adapterCapabilities: TaskDbAdapterCapability[]): McpRuntimeToolBinding[] {
  return [
    {
      toolName: 'site_task_lifecycle.plan_init',
      invocationMode: 'descriptor_request_result',
      adapterCapabilitiesRequired: [],
    },
    {
      toolName: 'site_task_lifecycle.project_inbox_envelope',
      invocationMode: 'descriptor_request_result',
      adapterCapabilitiesRequired: [],
    },
    {
      toolName: 'site_task_lifecycle.build_task_db_init_plan',
      invocationMode: 'descriptor_request_result',
      adapterCapabilitiesRequired: [adapterCapabilities[0]].filter(Boolean),
    },
    {
      toolName: 'site_task_lifecycle.build_task_admission_write_request',
      invocationMode: 'descriptor_request_result',
      adapterCapabilitiesRequired: adapterCapabilities,
    },
  ];
}
