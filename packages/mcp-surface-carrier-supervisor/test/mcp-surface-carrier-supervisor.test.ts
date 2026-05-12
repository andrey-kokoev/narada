import { describe, expect, it } from 'vitest';
import {
  DeniedMcpSupervisorActionError,
  DeniedMcpSupervisorInputError,
  assertNoDeniedSupervisorActions,
  assertNoDeniedSupervisorInputs,
  findDeniedSupervisorInputs,
  projectMcpSurfaceCarrierStatus,
} from '../src/index.js';
import {
  liveVerifiedSurfaceFixture,
  staleSurfaceFixture,
} from './fixtures/status-fixtures.js';

describe('MCP surface carrier supervisor status projection', () => {
  it('projects restart pressure as restart_requested without executing restart', () => {
    const status = projectMcpSurfaceCarrierStatus(staleSurfaceFixture);

    expect(status.lifecycleState).toBe('restart_requested');
    expect(status.reasons).toContain('source_newer_than_baseline');
    expect(status.reasons).toContain('restart_request_present_not_executed');
    expect(status.restartRequest?.executed).toBe(false);
    expect(status.packageKilledProcess).toBe(false);
    expect(status.packageRestartedCarrier).toBe(false);
    expect(status.packageReboundSurface).toBe(false);
    expect(status.stdioSelfRestartAllowed).toBe(false);
    expect(status.nativeShellFallbackAllowed).toBe(false);
  });

  it('projects a verified live surface from registry, carrier, and smoke evidence', () => {
    const status = projectMcpSurfaceCarrierStatus(liveVerifiedSurfaceFixture);

    expect(status.lifecycleState).toBe('live_verified');
    expect(status.reasons).toContain('live_verification_present');
    expect(status.runtimeRegistry.mcpExposed).toBe(true);
    expect(status.carrierSession.status).toBe('bound');
    expect(status.packageMutatedRuntimeRegistry).toBe(false);
  });

  it('keeps denied runtime actions and source imports visible as refusals', () => {
    const findings = findDeniedSupervisorInputs([
      'C:\\ProgramData\\Narada\\sites\\pc\\desktop-sunroom-2\\runtime\\mcp-registry.json',
      'C:\\Users\\Andrey\\Narada\\.ai\\mcp\\site-task-lifecycle-mcp.json',
      'C:\\Users\\Andrey\\Narada\\secrets\\token.txt',
    ]);

    expect(findings.map((finding) => finding.reason)).toEqual([
      'PC-locus state import',
      'source Site MCP runtime import',
      'secret or credential material',
    ]);
    expect(() => assertNoDeniedSupervisorInputs(findings.map((finding) => finding.path)))
      .toThrow(DeniedMcpSupervisorInputError);
    expect(() => assertNoDeniedSupervisorActions(['process_kill', 'stdio_self_restart']))
      .toThrow(DeniedMcpSupervisorActionError);

    const status = projectMcpSurfaceCarrierStatus({
      ...staleSurfaceFixture,
      deniedActionsRequested: ['process_kill', 'native_shell_fallback'],
      sourcePaths: findings.map((finding) => finding.path),
    });
    expect(status.reasons).toContain('denied_source_inputs_present');
    expect(status.reasons).toContain('denied_runtime_actions_requested');
    expect(status.deniedActionsRequested).toEqual(['process_kill', 'native_shell_fallback']);
  });
});
