export type SiteTaskLifecycleStatus = 'initialized';

export interface NeutralIdentity {
  identityId: string;
  role: 'architect' | 'builder' | 'reviewer' | 'observer' | string;
}

export interface SiteTaskLifecycleInitOptions {
  siteRoot: string;
  siteId: string;
  initializedBy: string;
  roster: NeutralIdentity[];
  sourceImportRefs?: string[];
  now?: string;
}

export interface SiteTaskLifecyclePaths {
  siteRoot: string;
  taskDbPath: string;
  taskSpecDir: string;
  manifestPath: string;
}

export interface SiteTaskLifecycleInitResult {
  status: SiteTaskLifecycleStatus;
  siteId: string;
  initializedBy: string;
  initializedAt: string;
  paths: SiteTaskLifecyclePaths;
  roster: NeutralIdentity[];
  rejectedSourceImports: string[];
}

export interface DeniedImportFinding {
  path: string;
  reason: string;
}

export type VerificationRunStatus = 'passed' | 'failed' | 'not_run';

export interface VerificationRunRecord {
  command: string;
  status: VerificationRunStatus;
  summary: string;
}

export type McpRegistrationStatus = 'snippet_ready' | 'registered' | 'not_registered';

export interface McpTransportRegistration {
  status: McpRegistrationStatus;
  siteRoot: string;
  packageName: string;
  command: string;
  args: string[];
}

export interface LocalIdentityMapping {
  localIdentity: NeutralIdentity;
  sourceRef?: string;
}

export interface CompatibilityProjectionPolicy {
  tableName: string;
  legacySourceTables: string[];
  projectionMode: 'neutral_only' | 'read_legacy_write_neutral';
  notes: string[];
}

export interface SiteTaskLifecycleAdmissionContractOptions {
  packageName?: string;
  packageVersion: string;
  localSiteRoot: string;
  localTaskDbPath: string;
  taskSpecProjectionDir: string;
  rosterInitializationSource: 'neutral_fixture' | 'receiving_site_roster' | 'operator_declared';
  mcpTransportRegistration?: Partial<McpTransportRegistration>;
  packageTests: VerificationRunRecord[];
  localIdentityMappings: LocalIdentityMapping[];
  rejectedSourcePaths: string[];
  compatibilityProjectionPolicy: CompatibilityProjectionPolicy;
  admittedBy: string;
  admittedAt: string;
}

export interface SiteTaskLifecycleAdmissionContract {
  schema: 'narada.site_task_lifecycle.admission_contract.v0';
  packageName: string;
  packageVersion: string;
  localSiteRoot: string;
  localTaskDbPath: string;
  taskSpecProjectionDir: string;
  rosterInitializationSource: SiteTaskLifecycleAdmissionContractOptions['rosterInitializationSource'];
  mcpTransportRegistration: McpTransportRegistration;
  packageTests: VerificationRunRecord[];
  localIdentityMappings: LocalIdentityMapping[];
  rejectedSourcePaths: string[];
  rejectedSourceFindings: DeniedImportFinding[];
  compatibilityProjectionPolicy: CompatibilityProjectionPolicy;
  admittedBy: string;
  admittedAt: string;
}

export interface JsonSchemaObject {
  type: string;
  required?: string[];
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  enum?: string[];
  additionalProperties?: boolean;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
}

export interface McpFacadeBinding {
  schema: 'narada.site_task_lifecycle.mcp_facade_binding.v0';
  packageName: string;
  siteRoot: string;
  transport: 'descriptor_only';
  tools: McpToolDescriptor[];
  deniedLiveEffects: string[];
}

export interface McpRuntimeBindingAuthorityBasis {
  siteId: string;
  taskSurfaceId: string;
  carrierId: string;
  admittedBy: NeutralIdentity;
  admittedAt: string;
  liveRegistrationAdmitted: false;
  adapterBoundary: TaskDbAdapterBoundary;
}

export interface McpRuntimeToolBinding {
  toolName: string;
  invocationMode: 'descriptor_request_result';
  adapterCapabilitiesRequired: TaskDbAdapterCapability[];
}

export interface McpRuntimeBindingRequestOptions {
  siteRoot: string;
  authorityBasis: McpRuntimeBindingAuthorityBasis;
  sourceImportRefs?: string[];
  liveRegistrationRequested?: boolean;
}

export interface McpRuntimeBindingRequest {
  schema: 'narada.site_task_lifecycle.mcp_runtime_binding_request.v0';
  packageName: string;
  siteRoot: string;
  authorityBasis: McpRuntimeBindingAuthorityBasis;
  facade: McpFacadeBinding;
  runtimeTools: McpRuntimeToolBinding[];
  sourceImportFindings: DeniedImportFinding[];
  liveRegistrationRequested: false;
}

export interface McpRuntimeBindingResult {
  schema: 'narada.site_task_lifecycle.mcp_runtime_binding_result.v0';
  bindingId: string;
  status: 'ready_for_admitted_runtime_surface';
  packageName: string;
  siteRoot: string;
  toolCount: number;
  adapterDecision: SqliteDependencyDecision;
  liveRegistrationPerformed: false;
  recordedAt: string;
}

export interface ExternalInboxEnvelope {
  envelopeId: string;
  sourceSite: string;
  sourceRef: string;
  receivedAt: string;
  summary: string;
  bodyText?: string;
  requestedBy?: string;
  evidencePaths?: string[];
}

export interface TaskCandidate {
  schema: 'narada.site_task_lifecycle.task_candidate.v0';
  taskId: string;
  title: string;
  sourceSite: string;
  sourceRef: string;
  receivedAt: string;
  summary: string;
  status: 'pending_admission';
  evidenceRefs: string[];
  requestedBy?: string;
  rejectedSourceFindings: DeniedImportFinding[];
}

export interface TaskDbSchemaStatement {
  name: string;
  sql: string;
}

export interface TaskDbInitPlan {
  schema: 'narada.site_task_lifecycle.task_db_init_plan.v0';
  taskDbPath: string;
  statements: TaskDbSchemaStatement[];
  deniedSourceImports: string[];
  sourceImportFindings: DeniedImportFinding[];
}

export type SqliteDependencyDecision = 'adapter_interface_only';

export interface TaskDbAdapterCapability {
  name: 'execute_schema_statement' | 'insert_task_record' | 'record_admission_event';
  status: 'required_for_future_write_path' | 'not_used_by_current_slice';
}

export interface TaskDbAdapterBoundary {
  schema: 'narada.site_task_lifecycle.task_db_adapter_boundary.v0';
  decision: SqliteDependencyDecision;
  packageOwnsSqliteDependency: false;
  packageExecutesSqliteMutation: false;
  requiredAdapterCapabilities: TaskDbAdapterCapability[];
  deniedSourceImports: string[];
  sourceImportFindings: DeniedImportFinding[];
  rationale: string[];
}

export interface TaskDbAdapter {
  readonly adapterId: string;
  executeSchemaStatement(statement: TaskDbSchemaStatement): Promise<void>;
  executeAdmissionWriteOperation(operation: TaskAdmissionWriteOperation): Promise<void>;
}

export interface TaskDbAdapterExecutionRequest {
  schema: 'narada.site_task_lifecycle.task_db_adapter_execution_request.v0';
  taskDbPath: string;
  statements: TaskDbSchemaStatement[];
  adapterCapabilitiesRequired: TaskDbAdapterCapability[];
  sourceImportFindings: DeniedImportFinding[];
}

export type TaskAdmissionWriteOperationKind = 'insert_task_record' | 'insert_evidence_ref' | 'record_admission_event';

export interface TaskAdmissionWriteOperation {
  kind: TaskAdmissionWriteOperationKind;
  description: string;
  parameters: Record<string, string>;
}

export interface TaskAdmissionWriteRequestOptions {
  taskDbPath: string;
  candidate: TaskCandidate;
  admittedBy: NeutralIdentity;
  admittedAt: string;
}

export interface TaskAdmissionWriteRequest {
  schema: 'narada.site_task_lifecycle.task_admission_write_request.v0';
  taskDbPath: string;
  candidate: TaskCandidate;
  admittedBy: NeutralIdentity;
  admittedAt: string;
  adapterDecision: SqliteDependencyDecision;
  adapterCapabilitiesRequired: TaskDbAdapterCapability[];
  operations: TaskAdmissionWriteOperation[];
}

export interface TaskAdmissionWriteResult {
  schema: 'narada.site_task_lifecycle.task_admission_write_result.v0';
  taskId: string;
  taskDbPath: string;
  status: 'ready_for_adapter';
  adapterId: string;
  operationCount: number;
  mutationExecutedByPackage: false;
  recordedAt: string;
}

export interface TaskDbAdapterConformanceContractOptions {
  adapterId: string;
  admittedBy: NeutralIdentity;
  admittedAt: string;
  sourceImportRefs?: string[];
}

export interface TaskDbAdapterConformanceContract {
  schema: 'narada.site_task_lifecycle.task_db_adapter_conformance_contract.v0';
  adapterId: string;
  admittedBy: NeutralIdentity;
  admittedAt: string;
  adapterDecision: SqliteDependencyDecision;
  packageOwnsSqliteDependency: false;
  packageExecutesSqliteMutation: false;
  requiredMethods: Array<keyof TaskDbAdapter>;
  requiredCapabilities: TaskDbAdapterCapability[];
  sourceImportFindings: DeniedImportFinding[];
}

export interface TaskDbAdapterConformanceResult {
  schema: 'narada.site_task_lifecycle.task_db_adapter_conformance_result.v0';
  adapterId: string;
  status: 'conforms';
  schemaStatementCount: number;
  admissionOperationCount: number;
  packageOwnsSqliteDependency: false;
  packageExecutesSqliteMutation: false;
  fixtureKind: 'neutral_in_memory';
  recordedAt: string;
}

export type ReceivingSiteSetupStepKind =
  | 'plan_initializer'
  | 'verify_adapter_conformance'
  | 'prepare_db_write_request'
  | 'prepare_mcp_runtime_binding'
  | 'await_live_execution_admission';

export interface ReceivingSiteSetupStep {
  kind: ReceivingSiteSetupStepKind;
  status: 'planned' | 'ready_for_admitted_external_execution' | 'blocked_pending_admission';
  summary: string;
}

export interface ReceivingSiteSetupPlanOptions {
  siteRoot: string;
  siteId: string;
  initializedBy: NeutralIdentity;
  roster: NeutralIdentity[];
  candidate: TaskCandidate;
  admittedAt: string;
  authorityBasis: McpRuntimeBindingAuthorityBasis;
  adapterConformance: TaskDbAdapterConformanceContract;
  sourceImportRefs?: string[];
}

export interface ReceivingSiteSetupPlan {
  schema: 'narada.site_task_lifecycle.receiving_site_setup_plan.v0';
  siteId: string;
  siteRoot: string;
  paths: SiteTaskLifecyclePaths;
  initializerOptions: SiteTaskLifecycleInitOptions;
  adapterConformance: TaskDbAdapterConformanceContract;
  taskDbInitPlan: TaskDbInitPlan;
  taskAdmissionWriteRequest: TaskAdmissionWriteRequest;
  mcpRuntimeBindingRequest: McpRuntimeBindingRequest;
  sourceImportFindings: DeniedImportFinding[];
  steps: ReceivingSiteSetupStep[];
  remainingAdmissionsRequired: string[];
}

export interface ReceivingSiteSetupResult {
  schema: 'narada.site_task_lifecycle.receiving_site_setup_result.v0';
  siteId: string;
  siteRoot: string;
  status: 'ready_for_admitted_execution';
  plannedStepCount: number;
  remainingAdmissionsRequired: string[];
  packageExecutedLiveRegistration: false;
  packageExecutedSqliteMutation: false;
  packageImportedSourceState: false;
  recordedAt: string;
}

export type LiveExecutionAdmissionKind =
  | 'initializer_execution'
  | 'real_adapter_admission'
  | 'db_mutation_execution'
  | 'live_mcp_registration';

export interface LiveExecutionAdmissionChecklistItem {
  kind: LiveExecutionAdmissionKind;
  authorityOwner: string;
  status: 'blocked_pending_admission';
  requiredEvidence: string[];
  refusalConditions: string[];
  rollbackPosture: string;
  terminalCriterion: string;
}

export interface LiveExecutionAdmissionChecklist {
  schema: 'narada.site_task_lifecycle.live_execution_admission_checklist.v0';
  siteId: string;
  siteRoot: string;
  setupPlan: ReceivingSiteSetupPlan;
  items: LiveExecutionAdmissionChecklistItem[];
  terminalStateClaimable: false;
  terminalStateBlockedBy: LiveExecutionAdmissionKind[];
}

export interface LiveExecutionAdmissionResult {
  schema: 'narada.site_task_lifecycle.live_execution_admission_result.v0';
  siteId: string;
  siteRoot: string;
  status: 'blocked_pending_live_execution';
  terminalStateClaimable: false;
  blockedBy: LiveExecutionAdmissionKind[];
  packageExecutedLiveRegistration: false;
  packageExecutedSqliteMutation: false;
  packageImportedSourceState: false;
  recordedAt: string;
}
