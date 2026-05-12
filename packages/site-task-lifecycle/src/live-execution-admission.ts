import type {
  LiveExecutionAdmissionChecklist,
  LiveExecutionAdmissionChecklistItem,
  LiveExecutionAdmissionResult,
  ReceivingSiteSetupPlan,
} from './types.js';

export function buildLiveExecutionAdmissionChecklist(
  setupPlan: ReceivingSiteSetupPlan,
): LiveExecutionAdmissionChecklist {
  const items = buildChecklistItems();
  return {
    schema: 'narada.site_task_lifecycle.live_execution_admission_checklist.v0',
    siteId: setupPlan.siteId,
    siteRoot: setupPlan.siteRoot,
    setupPlan,
    items,
    terminalStateClaimable: false,
    terminalStateBlockedBy: items.map((item) => item.kind),
  };
}

export function buildLiveExecutionAdmissionResult(
  checklist: LiveExecutionAdmissionChecklist,
  recordedAt: string,
): LiveExecutionAdmissionResult {
  return {
    schema: 'narada.site_task_lifecycle.live_execution_admission_result.v0',
    siteId: checklist.siteId,
    siteRoot: checklist.siteRoot,
    status: 'blocked_pending_live_execution',
    terminalStateClaimable: false,
    blockedBy: checklist.terminalStateBlockedBy,
    packageExecutedLiveRegistration: false,
    packageExecutedSqliteMutation: false,
    packageImportedSourceState: false,
    recordedAt,
  };
}

function buildChecklistItems(): LiveExecutionAdmissionChecklistItem[] {
  return [
    {
      kind: 'initializer_execution',
      authorityOwner: 'receiving Site authority',
      status: 'blocked_pending_admission',
      requiredEvidence: [
        'approved initializer options',
        'created local task lifecycle directories',
        'local admission manifest written under receiving Site root',
      ],
      refusalConditions: [
        'source Site runtime state is requested as initializer input',
        'non-neutral local identities are requested',
        'target root is not admitted for receiving Site writes',
      ],
      rollbackPosture: 'Remove only initializer-created receiving-Site directories/manifests if no later admitted DB mutation depends on them.',
      terminalCriterion: 'Receiving Site has local task lifecycle paths and manifest created under admitted authority.',
    },
    {
      kind: 'real_adapter_admission',
      authorityOwner: 'receiving Site storage authority',
      status: 'blocked_pending_admission',
      requiredEvidence: [
        'concrete adapter id and owning package/runtime',
        'adapter conformance evidence',
        'driver/dependency decision outside @narada2/site-task-lifecycle',
      ],
      refusalConditions: [
        'adapter imports source Site DB/history/state',
        'adapter depends on package-owned SQLite driver',
        'adapter lacks rollback/closeout evidence plan',
      ],
      rollbackPosture: 'Remove or disable only the admitted concrete adapter binding; package-level conformance contracts remain inert.',
      terminalCriterion: 'A concrete adapter is admitted outside the package and proves the required adapter capabilities.',
    },
    {
      kind: 'db_mutation_execution',
      authorityOwner: 'receiving Site task DB authority',
      status: 'blocked_pending_admission',
      requiredEvidence: [
        'task DB schema execution result',
        'task admission write execution result',
        'post-write readback or equivalent confirmation',
      ],
      refusalConditions: [
        'mutation targets source Site DB',
        'mutation imports source task/inbox history',
        'mutation lacks idempotency or rollback evidence',
      ],
      rollbackPosture: 'Use adapter-owned rollback for only the admitted write batch, preserving external evidence and package source.',
      terminalCriterion: 'Receiving Site task DB contains the admitted schema and at least one locally admitted task record.',
    },
    {
      kind: 'live_mcp_registration',
      authorityOwner: 'Narada proper MCP/runtime authority',
      status: 'blocked_pending_admission',
      requiredEvidence: [
        'approved MCP runtime binding request',
        'transport registration evidence',
        'tool invocation smoke test constrained by adapter authority',
      ],
      refusalConditions: [
        'live registration bypasses Narada proper authority',
        'tools can mutate without admitted adapter authority',
        'registration imports source Site state or secrets',
      ],
      rollbackPosture: 'Unregister only the admitted MCP binding and preserve setup/admission evidence.',
      terminalCriterion: 'Narada proper can invoke task lifecycle tools through live MCP without bypassing adapter authority.',
    },
  ];
}
