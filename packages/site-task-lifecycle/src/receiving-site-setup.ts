import {
  DeniedSourceImportError,
  assertNeutralIdentities,
  findDeniedSourceImports,
} from './import-refusal.js';
import { planSiteTaskLifecyclePaths } from './initialize.js';
import { buildMcpRuntimeBindingRequest } from './mcp-runtime-binding.js';
import { buildTaskAdmissionWriteRequest } from './task-admission-write.js';
import { buildTaskDbInitPlan } from './task-db-schema.js';
import type {
  ReceivingSiteSetupPlan,
  ReceivingSiteSetupPlanOptions,
  ReceivingSiteSetupResult,
  ReceivingSiteSetupStep,
} from './types.js';

const REMAINING_ADMISSIONS = [
  'receiving-Site initializer execution',
  'concrete adapter execution outside @narada2/site-task-lifecycle',
  'receiving-Site DB mutation execution',
  'Narada proper live MCP registration admission',
];

export function buildReceivingSiteSetupPlan(options: ReceivingSiteSetupPlanOptions): ReceivingSiteSetupPlan {
  assertNeutralIdentities([options.initializedBy, ...options.roster, options.adapterConformance.admittedBy]);

  const sourceImportRefs = [
    ...(options.sourceImportRefs ?? []),
    ...options.candidate.evidenceRefs,
  ];
  const sourceImportFindings = findDeniedSourceImports(sourceImportRefs);
  if (sourceImportFindings.length > 0) {
    throw new DeniedSourceImportError(sourceImportFindings);
  }

  const paths = planSiteTaskLifecyclePaths(options.siteRoot);
  const initializerOptions = {
    siteRoot: options.siteRoot,
    siteId: options.siteId,
    initializedBy: options.initializedBy.identityId,
    roster: options.roster,
    sourceImportRefs: options.sourceImportRefs,
    now: options.admittedAt,
  };
  const taskDbInitPlan = buildTaskDbInitPlan(paths.taskDbPath);
  const taskAdmissionWriteRequest = buildTaskAdmissionWriteRequest({
    taskDbPath: paths.taskDbPath,
    candidate: options.candidate,
    admittedBy: options.initializedBy,
    admittedAt: options.admittedAt,
  });
  const mcpRuntimeBindingRequest = buildMcpRuntimeBindingRequest({
    siteRoot: options.siteRoot,
    authorityBasis: options.authorityBasis,
  });

  return {
    schema: 'narada.site_task_lifecycle.receiving_site_setup_plan.v0',
    siteId: options.siteId,
    siteRoot: options.siteRoot,
    paths,
    initializerOptions,
    adapterConformance: options.adapterConformance,
    taskDbInitPlan,
    taskAdmissionWriteRequest,
    mcpRuntimeBindingRequest,
    sourceImportFindings,
    steps: buildSetupSteps(),
    remainingAdmissionsRequired: REMAINING_ADMISSIONS,
  };
}

export function buildReceivingSiteSetupResult(
  plan: ReceivingSiteSetupPlan,
  recordedAt: string,
): ReceivingSiteSetupResult {
  return {
    schema: 'narada.site_task_lifecycle.receiving_site_setup_result.v0',
    siteId: plan.siteId,
    siteRoot: plan.siteRoot,
    status: 'ready_for_admitted_execution',
    plannedStepCount: plan.steps.length,
    remainingAdmissionsRequired: plan.remainingAdmissionsRequired,
    packageExecutedLiveRegistration: false,
    packageExecutedSqliteMutation: false,
    packageImportedSourceState: false,
    recordedAt,
  };
}

function buildSetupSteps(): ReceivingSiteSetupStep[] {
  return [
    {
      kind: 'plan_initializer',
      status: 'planned',
      summary: 'Plan receiving-Site lifecycle paths and initializer options without writing files.',
    },
    {
      kind: 'verify_adapter_conformance',
      status: 'planned',
      summary: 'Attach adapter conformance evidence; real adapter admission remains outside the package.',
    },
    {
      kind: 'prepare_db_write_request',
      status: 'ready_for_admitted_external_execution',
      summary: 'Prepare task admission write request for a separately admitted adapter.',
    },
    {
      kind: 'prepare_mcp_runtime_binding',
      status: 'ready_for_admitted_external_execution',
      summary: 'Prepare MCP runtime binding request without live registration.',
    },
    {
      kind: 'await_live_execution_admission',
      status: 'blocked_pending_admission',
      summary: 'Live initializer execution, DB mutation, and MCP registration require separate Narada proper admission.',
    },
  ];
}
