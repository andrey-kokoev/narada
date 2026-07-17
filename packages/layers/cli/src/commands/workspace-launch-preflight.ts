import { NARADA_AGENT_RUNTIME_SERVER_KIND } from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import type { WorkspaceLaunchAgentPlan } from './workspace-launch-types.js';
import {
  WORKSPACE_LAUNCH_CAPABILITY_MATRIX_SCHEMA,
  WORKSPACE_LAUNCH_TRANSACTION_SCHEMA,
  WorkspaceLaunchContractError,
  assertStructuredWorkspaceLaunchArgv,
  assertWorkspaceLaunchPathProvenance,
} from './workspace-launch-contracts.js';

export function assertWorkspaceLaunchPlanPreflight(plans: WorkspaceLaunchAgentPlan[]): void {
  for (const plan of plans) assertWorkspaceLaunchAgentPreflight(plan);
}

export function assertWorkspaceLaunchAgentPreflight(plan: WorkspaceLaunchAgentPlan): void {
  const ownership = plan.process_ownership;
  if (!plan.launch_session_id || !ownership) {
    throw new Error(`workspace_launch_process_ownership_missing: ${plan.agent}`);
  }
  const ownershipErrors = ownership.validation_errors;
  if (ownership.schema !== 'narada.launch_process_ownership.v1'
    || ownership.launch_session_id !== plan.launch_session_id
    || ownership.ownership !== 'session_owned'
    || ownership.process_role !== 'workspace_launch_plan'
    || ownership.evidence_status !== 'complete'
    || !Array.isArray(ownershipErrors)
    || ownershipErrors.length > 0) {
    throw new Error(`workspace_launch_process_ownership_invalid: ${plan.agent}`);
  }

  const identity = plan.agent_identity_ref;
  if (!identity || typeof identity.canonical_agent_id !== 'string'
    || !identity.canonical_agent_id.trim()) {
    throw new Error(`workspace_launch_agent_identity_invalid: ${plan.agent}`);
  }
  const selectionResolution = plan.selection_resolution;
  if (!selectionResolution || selectionResolution.schema !== 'narada.workspace_launch.selection_resolution.v1') {
    throw new Error(`workspace_launch_selection_resolution_missing: ${plan.agent}`);
  }
  if (!plan.capability_admission
    || plan.capability_admission.schema !== WORKSPACE_LAUNCH_CAPABILITY_MATRIX_SCHEMA
    || plan.capability_admission.admission !== 'admitted') {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_capability_admission_missing',
      `No admitted capability matrix exists for ${plan.agent}.`,
      'Regenerate the launch plan through the canonical workspace launcher.',
    );
  }
  assertWorkspaceLaunchPathProvenance(plan.path_provenance);
  if (!plan.transaction
    || plan.transaction.schema !== WORKSPACE_LAUNCH_TRANSACTION_SCHEMA
    || plan.transaction.state !== 'planned'
    || !Array.isArray(plan.transaction.history)) {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_transaction_invalid',
      `Launch transaction is not in planned state for ${plan.agent}.`,
      'Regenerate the launch plan before executing it.',
    );
  }
  if (!Array.isArray(plan.launch_operator_surfaces)
    || plan.launch_operator_surfaces.length === 0
    || plan.launch_operator_surfaces.some((surface) => typeof surface !== 'string' || !surface.trim())
    || typeof plan.launch_runtime !== 'string'
    || !plan.launch_runtime.trim()) {
    throw new Error(`workspace_launch_resolved_selection_incomplete: ${plan.agent}`);
  }
  if (plan.runtime_start_execution_mode !== 'hidden_detached' && plan.runtime_start_execution_mode !== 'operator_terminal') {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_runtime_start_mode_invalid',
      `Runtime start mode is invalid for ${plan.agent}.`,
      'Regenerate the launch plan from the canonical runtime/surface selection.',
    );
  }
  const hiddenWebUiProjection = plan.launch_operator_surfaces.includes('agent-web-ui')
    && plan.runtime_start_execution_mode === 'hidden_detached'
    && Array.isArray(plan.operator_projection_start_command);
  if (plan.launch_operator_surfaces.includes('agent-web-ui')
    && plan.runtime_start_execution_mode !== 'operator_terminal'
    && !hiddenWebUiProjection) {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_runtime_start_mode_inconsistent',
      `agent-web-ui requires either a durable hidden projection command or an explicit operator-terminal handoff for ${plan.agent}.`,
      'Regenerate the launch plan with an admitted projection launch mode.',
    );
  }
  if (plan.runtime_host_kind !== NARADA_AGENT_RUNTIME_SERVER_KIND && plan.runtime_start_execution_mode !== 'operator_terminal') {
    throw new WorkspaceLaunchContractError(
      'workspace_launch_runtime_start_mode_inconsistent',
      `Runtime ${plan.runtime_host_kind} cannot use hidden runtime-server execution mode for ${plan.agent}.`,
      'Regenerate the launch plan with a compatible operator surface/runtime pair.',
    );
  }
  assertStructuredWorkspaceLaunchArgv(plan.runtime_start_command, 'runtime_start_command');
  assertStructuredWorkspaceLaunchArgv(plan.hidden_runtime_start_command, 'hidden_runtime_start_command');
  if (!Array.isArray(plan.wt_args) || !Array.isArray(plan.terminal_tabs)
    || (plan.terminal_tabs.length === 0 && !hiddenWebUiProjection)) {
    throw new Error(`workspace_launch_runtime_command_missing: ${plan.agent}`);
  }
  for (const [index, tab] of plan.terminal_tabs.entries()) {
    if (!tab || typeof tab.cwd !== 'string' || !tab.cwd.trim() || typeof tab.command !== 'string' || !tab.command.trim() || tab.command_authority !== 'projection_only') {
      throw new WorkspaceLaunchContractError(
        'workspace_launch_terminal_tab_invalid',
        `Terminal tab ${index} is incomplete or has an execution-authority mismatch for ${plan.agent}.`,
        'Regenerate the launch plan from structured command specifications; terminal script text is projection-only.',
      );
    }
    assertStructuredWorkspaceLaunchArgv(tab.command_argv, `terminal_tabs[${index}].command_argv`);
  }
  if (hiddenWebUiProjection) {
    assertStructuredWorkspaceLaunchArgv(plan.operator_projection_start_command, 'operator_projection_start_command');
  }

  if (plan.runtime_host_kind === NARADA_AGENT_RUNTIME_SERVER_KIND && !plan.intelligence_provider) {
    throw new Error(`workspace_launch_intelligence_provider_missing: ${plan.agent}`);
  }

  if (plan.launch_operator_surfaces.includes('agent-web-ui')) {
    const binding = plan.operator_projection_launch_binding;
    if (!binding
      || binding.schema !== 'narada.operator_projection_launch_binding_ref.v1'
      || typeof binding.path !== 'string'
      || !binding.path
      || binding.exact_attach_required !== true
      || !binding.lease
      || binding.lease.schema !== 'narada.operator_projection_attachment_lease.v1'
      || binding.lease.binding_path !== binding.path
      || binding.lease.exact_session !== true
      || binding.lease.exact_endpoint !== true) {
      throw new Error(`workspace_launch_web_ui_binding_invalid: ${plan.agent}`);
    }
    const projectionEvidence = [
      plan.wt_args.join('\n'),
      ...(plan.operator_projection_start_command ?? []),
    ].join('\n');
    if (!projectionEvidence.includes(binding.path)) {
      throw new Error(`workspace_launch_web_ui_binding_not_handed_off: ${plan.agent}`);
    }
  }
}
