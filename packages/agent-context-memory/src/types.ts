export type JsonObject = Record<string, unknown>;

export interface DeniedImportFinding {
  path: string;
  reason: string;
}

export interface MechanicalVerificationBasis {
  kind: 'operator_admission' | 'capability_grant' | 'runtime_binding_readback' | 'test_fixture';
  evidenceRefs: string[];
  verifiedAt?: string;
}

export interface RoleCompatibilityIdentity {
  roleName: string;
  compatibilityIdentity: string;
  admissionRef: string;
}

export interface NamedAgentRegistryFragment {
  schema: 'narada.agent_context_memory.named_agent_registry_fragment.v0';
  siteId: string;
  namedAgentId: string;
  displayName: string;
  allowedRoleNames: string[];
  compatibilityIdentities: RoleCompatibilityIdentity[];
  mechanicalVerificationBasis: MechanicalVerificationBasis;
  sourceImportFindings: DeniedImportFinding[];
}

export interface RoleAssignmentDescriptor {
  roleName: string;
  assignedBy: string;
  assignmentRef: string;
}

export interface SessionStartContract {
  schema: 'narada.agent_context_memory.session_start_contract.v0';
  siteId: string;
  sessionId: string;
  namedAgentId: string;
  roleAssignment: RoleAssignmentDescriptor | null;
  claimedIdentity: string | null;
  claimedIdentityIsAuthority: false;
  mechanicalVerificationBasis: MechanicalVerificationBasis;
  sourceImportFindings: DeniedImportFinding[];
}

export interface CheckpointDescriptor {
  schema: 'narada.agent_context_memory.checkpoint_descriptor.v0';
  checkpointId: string;
  sessionId: string;
  namedAgentId: string;
  summary: string;
  evidenceRefs: string[];
  capturedAt: string;
  persistedByPackage: false;
  sourceImportFindings: DeniedImportFinding[];
}

export interface HydrationRequestDescriptor {
  schema: 'narada.agent_context_memory.hydration_request_descriptor.v0';
  hydrationId: string;
  namedAgentId: string;
  checkpointRefs: string[];
  requestedBy: string;
  mode: 'descriptor_only';
  executedByPackage: false;
  sourceImportFindings: DeniedImportFinding[];
}

export interface SchemaStatementDescriptor {
  id: string;
  sql: string;
  mutating: false;
}

export interface SchemaInitPlan {
  schema: 'narada.agent_context_memory.schema_init_plan.v0';
  storage: 'sqlite_descriptor_only';
  packageOwnsSqliteDependency: false;
  packageExecutesSqliteMutation: false;
  statements: SchemaStatementDescriptor[];
  sourceImportFindings: DeniedImportFinding[];
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export interface McpRegistrationDescriptor {
  schema: 'narada.agent_context_memory.mcp_registration_descriptor.v0';
  packageName: '@narada2/agent-context-memory';
  transport: 'descriptor_only';
  liveRegistrationPerformed: false;
  tools: McpToolDescriptor[];
  deniedLiveEffects: string[];
}

export interface CapabilityRegistryFragment {
  schema: 'narada.agent_context_memory.capability_registry_fragment.v0';
  capabilityFamily: 'agent_context_memory';
  packageName: '@narada2/agent-context-memory';
  capabilities: Array<{
    capability: string;
    posture: 'descriptor_only' | 'requires_local_admission';
  }>;
  deniedCapabilities: string[];
}
