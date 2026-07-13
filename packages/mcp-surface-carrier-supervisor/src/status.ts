import { findDeniedSupervisorInputs } from './refusal.js';
import { transitionCapabilityLifecycle } from './capability-lifecycle.js';
import { transitionMcpSurfaceCarrierLifecycle } from './lifecycle.js';
import type {
  McpSurfaceCarrierLifecycleState,
  McpSurfaceCarrierStatusInput,
  McpSurfaceCarrierStatusResult,
} from './types.js';

export function projectMcpSurfaceCarrierStatus(
  input: McpSurfaceCarrierStatusInput,
): McpSurfaceCarrierStatusResult {
  const deniedInputFindings = findDeniedSupervisorInputs(input.sourcePaths ?? []);
  const deniedActionsRequested = input.deniedActionsRequested ?? [];
  const lifecycleState = determineLifecycleState(input);
  const lifecycleMachine = input.previousLifecycleState
    ? transitionMcpSurfaceCarrierLifecycle(
        { state: input.previousLifecycleState, history: [input.previousLifecycleState] },
        lifecycleState,
      )
    : undefined;
  const capabilityTransition = input.capability.previousState
    ? transitionCapabilityLifecycle(input.capability.previousState, input.capability.state)
    : undefined;
  const reasons = buildReasons(input, lifecycleState, deniedInputFindings.length, deniedActionsRequested.length);

  return {
    schema: 'narada.mcp_surface_carrier_supervisor.status.v0',
    surfaceId: input.mcpProcess.surfaceId,
    lifecycleState,
    previousLifecycleState: input.previousLifecycleState,
    lifecycleTransition: lifecycleMachine && lifecycleMachine.state !== input.previousLifecycleState
      ? { from: input.previousLifecycleState!, to: lifecycleMachine.state }
      : undefined,
    exposureClass: 'read_only',
    siteAuthority: input.siteAuthority,
    mcpProcess: input.mcpProcess,
    carrierSession: input.carrierSession,
    runtimeRegistry: input.runtimeRegistry,
    capability: input.capability,
    capabilityTransition,
    restartRequest: input.restartRequest,
    verification: input.verification,
    reasons,
    deniedInputFindings,
    deniedActionsRequested,
    packageKilledProcess: false,
    packageRestartedCarrier: false,
    packageReboundSurface: false,
    packageMutatedRuntimeRegistry: false,
    stdioSelfRestartAllowed: false,
    nativeShellFallbackAllowed: false,
  };
}

function determineLifecycleState(input: McpSurfaceCarrierStatusInput): McpSurfaceCarrierLifecycleState {
  if (
    input.verification?.live === true
    && input.runtimeRegistry.surfaceRegistered
    && input.runtimeRegistry.mcpExposed
    && input.carrierSession.status === 'bound'
  ) {
    return 'live_verified';
  }

  if (input.restartRequest || input.sourceNewerThanBaseline) {
    return 'restart_requested';
  }

  if (input.carrierSession.status === 'restarted') {
    return 'carrier_restarted';
  }

  return 'stale';
}

function buildReasons(
  input: McpSurfaceCarrierStatusInput,
  lifecycleState: McpSurfaceCarrierLifecycleState,
  deniedInputCount: number,
  deniedActionCount: number,
): string[] {
  const reasons = [`state:${lifecycleState}`];
  if (input.sourceNewerThanBaseline) reasons.push('source_newer_than_baseline');
  if (input.restartRequest) reasons.push('restart_request_present_not_executed');
  if (input.verification?.live === true) reasons.push('live_verification_present');
  if (!input.runtimeRegistry.surfaceRegistered) reasons.push('surface_not_registered');
  if (!input.runtimeRegistry.mcpExposed) reasons.push('mcp_not_exposed');
  if (input.carrierSession.status === 'stale') reasons.push('carrier_session_stale');
  if (deniedInputCount > 0) reasons.push('denied_source_inputs_present');
  if (deniedActionCount > 0) reasons.push('denied_runtime_actions_requested');
  return reasons;
}
