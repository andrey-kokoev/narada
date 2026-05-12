import {
  DeniedSourceImportError,
  assertNeutralIdentities,
  findDeniedSourceImports,
} from './import-refusal.js';
import { TASK_DB_SCHEMA_STATEMENTS } from './task-db-schema.js';
import type {
  TaskAdmissionWriteRequest,
  TaskDbAdapter,
  TaskDbAdapterBoundary,
  TaskDbAdapterConformanceContract,
  TaskDbAdapterConformanceContractOptions,
  TaskDbAdapterConformanceResult,
  TaskDbAdapterExecutionRequest,
} from './types.js';

const REQUIRED_ADAPTER_CAPABILITIES = [
  { name: 'execute_schema_statement', status: 'required_for_future_write_path' },
  { name: 'insert_task_record', status: 'required_for_future_write_path' },
  { name: 'record_admission_event', status: 'required_for_future_write_path' },
] as const;

const DENIED_SOURCE_IMPORTS = [
  'source task lifecycle databases',
  'source task history',
  'source inbox databases and envelopes',
  'source rosters',
  'source checkpoints and agent-context databases',
  'source operator-surface bindings',
  'PC-locus runtime state',
  'secrets and credentials',
];

export function decideTaskDbAdapterBoundary(sourceImportRefs: string[] = []): TaskDbAdapterBoundary {
  return {
    schema: 'narada.site_task_lifecycle.task_db_adapter_boundary.v0',
    decision: 'adapter_interface_only',
    packageOwnsSqliteDependency: false,
    packageExecutesSqliteMutation: false,
    requiredAdapterCapabilities: [...REQUIRED_ADAPTER_CAPABILITIES],
    deniedSourceImports: DENIED_SOURCE_IMPORTS,
    sourceImportFindings: findDeniedSourceImports(sourceImportRefs),
    rationale: [
      'The package currently owns portable task lifecycle contracts, schema statements, and admission guards.',
      'SQLite driver ownership is a runtime capability decision that must belong to the receiving Site or an admitted storage package.',
      'Keeping this package adapter-only prevents source-Site database imports from becoming the implementation path.',
    ],
  };
}

export function buildTaskDbAdapterExecutionRequest(
  taskDbPath: string,
  sourceImportRefs: string[] = [],
): TaskDbAdapterExecutionRequest {
  return {
    schema: 'narada.site_task_lifecycle.task_db_adapter_execution_request.v0',
    taskDbPath,
    statements: TASK_DB_SCHEMA_STATEMENTS,
    adapterCapabilitiesRequired: [...REQUIRED_ADAPTER_CAPABILITIES],
    sourceImportFindings: findDeniedSourceImports(sourceImportRefs),
  };
}

export function buildTaskDbAdapterConformanceContract(
  options: TaskDbAdapterConformanceContractOptions,
): TaskDbAdapterConformanceContract {
  assertNeutralIdentities([options.admittedBy]);
  const sourceImportFindings = findDeniedSourceImports(options.sourceImportRefs ?? []);
  if (sourceImportFindings.length > 0) {
    throw new DeniedSourceImportError(sourceImportFindings);
  }

  return {
    schema: 'narada.site_task_lifecycle.task_db_adapter_conformance_contract.v0',
    adapterId: options.adapterId,
    admittedBy: options.admittedBy,
    admittedAt: options.admittedAt,
    adapterDecision: 'adapter_interface_only',
    packageOwnsSqliteDependency: false,
    packageExecutesSqliteMutation: false,
    requiredMethods: ['executeSchemaStatement', 'executeAdmissionWriteOperation'],
    requiredCapabilities: [...REQUIRED_ADAPTER_CAPABILITIES],
    sourceImportFindings,
  };
}

export async function runNeutralTaskDbAdapterConformance(
  adapter: TaskDbAdapter,
  contract: TaskDbAdapterConformanceContract,
  writeRequest: TaskAdmissionWriteRequest,
  recordedAt: string,
): Promise<TaskDbAdapterConformanceResult> {
  if (adapter.adapterId !== contract.adapterId) {
    throw new Error(`Adapter id mismatch: ${adapter.adapterId} !== ${contract.adapterId}`);
  }

  for (const statement of TASK_DB_SCHEMA_STATEMENTS) {
    await adapter.executeSchemaStatement(statement);
  }
  for (const operation of writeRequest.operations) {
    await adapter.executeAdmissionWriteOperation(operation);
  }

  return {
    schema: 'narada.site_task_lifecycle.task_db_adapter_conformance_result.v0',
    adapterId: adapter.adapterId,
    status: 'conforms',
    schemaStatementCount: TASK_DB_SCHEMA_STATEMENTS.length,
    admissionOperationCount: writeRequest.operations.length,
    packageOwnsSqliteDependency: false,
    packageExecutesSqliteMutation: false,
    fixtureKind: 'neutral_in_memory',
    recordedAt,
  };
}
