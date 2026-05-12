import {
  assertClaimedIdentityIsNotAuthority,
  assertMechanicalVerificationBasis,
  assertRoleCompatibilityAdmissions,
} from './identity.js';
import { findDeniedSourceImports } from './import-refusal.js';
import type {
  CapabilityRegistryFragment,
  CheckpointDescriptor,
  HydrationRequestDescriptor,
  McpRegistrationDescriptor,
  NamedAgentRegistryFragment,
  RoleAssignmentDescriptor,
  RoleCompatibilityIdentity,
  SessionStartContract,
  MechanicalVerificationBasis,
} from './types.js';

const PACKAGE_NAME = '@narada2/agent-context-memory' as const;

export interface NamedAgentRegistryOptions {
  siteId: string;
  namedAgentId: string;
  displayName: string;
  allowedRoleNames: string[];
  compatibilityIdentities?: RoleCompatibilityIdentity[];
  mechanicalVerificationBasis: MechanicalVerificationBasis;
  sourceImportRefs?: string[];
}

export function buildNamedAgentRegistryFragment(options: NamedAgentRegistryOptions): NamedAgentRegistryFragment {
  assertMechanicalVerificationBasis(options.mechanicalVerificationBasis);
  assertRoleCompatibilityAdmissions(options.compatibilityIdentities ?? []);

  return {
    schema: 'narada.agent_context_memory.named_agent_registry_fragment.v0',
    siteId: options.siteId,
    namedAgentId: options.namedAgentId,
    displayName: options.displayName,
    allowedRoleNames: [...options.allowedRoleNames],
    compatibilityIdentities: [...(options.compatibilityIdentities ?? [])],
    mechanicalVerificationBasis: options.mechanicalVerificationBasis,
    sourceImportFindings: findDeniedSourceImports(options.sourceImportRefs ?? []),
  };
}

export interface SessionStartOptions {
  siteId: string;
  sessionId: string;
  namedAgentId: string;
  roleAssignment?: RoleAssignmentDescriptor | null;
  claimedIdentity?: string | null;
  mechanicalVerificationBasis: MechanicalVerificationBasis;
  sourceImportRefs?: string[];
}

export function buildSessionStartContract(options: SessionStartOptions): SessionStartContract {
  assertMechanicalVerificationBasis(options.mechanicalVerificationBasis);
  assertClaimedIdentityIsNotAuthority(options.claimedIdentity ?? null, options.mechanicalVerificationBasis);

  return {
    schema: 'narada.agent_context_memory.session_start_contract.v0',
    siteId: options.siteId,
    sessionId: options.sessionId,
    namedAgentId: options.namedAgentId,
    roleAssignment: options.roleAssignment ?? null,
    claimedIdentity: options.claimedIdentity ?? null,
    claimedIdentityIsAuthority: false,
    mechanicalVerificationBasis: options.mechanicalVerificationBasis,
    sourceImportFindings: findDeniedSourceImports(options.sourceImportRefs ?? []),
  };
}

export interface CheckpointDescriptorOptions {
  checkpointId: string;
  sessionId: string;
  namedAgentId: string;
  summary: string;
  evidenceRefs: string[];
  capturedAt: string;
  sourceImportRefs?: string[];
}

export function buildCheckpointDescriptor(options: CheckpointDescriptorOptions): CheckpointDescriptor {
  return {
    schema: 'narada.agent_context_memory.checkpoint_descriptor.v0',
    checkpointId: options.checkpointId,
    sessionId: options.sessionId,
    namedAgentId: options.namedAgentId,
    summary: options.summary,
    evidenceRefs: [...options.evidenceRefs],
    capturedAt: options.capturedAt,
    persistedByPackage: false,
    sourceImportFindings: findDeniedSourceImports(options.sourceImportRefs ?? []),
  };
}

export interface HydrationRequestOptions {
  hydrationId: string;
  namedAgentId: string;
  checkpointRefs: string[];
  requestedBy: string;
  sourceImportRefs?: string[];
}

export function buildHydrationRequestDescriptor(options: HydrationRequestOptions): HydrationRequestDescriptor {
  return {
    schema: 'narada.agent_context_memory.hydration_request_descriptor.v0',
    hydrationId: options.hydrationId,
    namedAgentId: options.namedAgentId,
    checkpointRefs: [...options.checkpointRefs],
    requestedBy: options.requestedBy,
    mode: 'descriptor_only',
    executedByPackage: false,
    sourceImportFindings: findDeniedSourceImports(options.sourceImportRefs ?? []),
  };
}

export function buildMcpRegistrationDescriptor(): McpRegistrationDescriptor {
  return {
    schema: 'narada.agent_context_memory.mcp_registration_descriptor.v0',
    packageName: PACKAGE_NAME,
    transport: 'descriptor_only',
    liveRegistrationPerformed: false,
    tools: [
      { name: 'agent_context_memory.plan_schema_init', description: 'Describe Site-local agent-context schema initialization without mutation.', inputSchema: { type: 'object' } },
      { name: 'agent_context_memory.build_named_agent_registry_fragment', description: 'Build named-agent registry descriptor with identity doctrine guards.', inputSchema: { type: 'object' } },
      { name: 'agent_context_memory.plan_session_start', description: 'Build session start descriptor with claimed-identity refusal posture.', inputSchema: { type: 'object' } },
      { name: 'agent_context_memory.record_checkpoint_descriptor', description: 'Describe checkpoint evidence without persisting runtime memory.', inputSchema: { type: 'object' } },
      { name: 'agent_context_memory.plan_hydration', description: 'Describe hydration request without executing runtime hydration.', inputSchema: { type: 'object' } },
    ],
    deniedLiveEffects: [
      'live MCP registration',
      'SQLite mutation',
      'runtime hydration',
      'source Site state import',
    ],
  };
}

export function buildCapabilityRegistryFragment(): CapabilityRegistryFragment {
  return {
    schema: 'narada.agent_context_memory.capability_registry_fragment.v0',
    capabilityFamily: 'agent_context_memory',
    packageName: PACKAGE_NAME,
    capabilities: [
      { capability: 'named_agent_registry_fragment', posture: 'descriptor_only' },
      { capability: 'session_start_contract', posture: 'descriptor_only' },
      { capability: 'checkpoint_descriptor', posture: 'descriptor_only' },
      { capability: 'hydration_request_descriptor', posture: 'descriptor_only' },
      { capability: 'schema_init_plan', posture: 'descriptor_only' },
      { capability: 'live_storage_adapter', posture: 'requires_local_admission' },
      { capability: 'live_mcp_transport', posture: 'requires_local_admission' },
    ],
    deniedCapabilities: [
      'source checkpoint import',
      'source agent-context DB import',
      'package-owned SQLite mutation',
      'claimed-identity authority',
    ],
  };
}
