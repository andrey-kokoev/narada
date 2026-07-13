import { describe, expect, it } from 'vitest';
import {
  assertCapabilityLifecycleTransition,
  assertMcpSurfaceCarrierLifecycleTransition,
  projectMcpSurfaceCarrierStatus,
  transitionCapabilityLifecycle,
  transitionMcpSurfaceCarrierLifecycle,
} from '../src/index.js';
import { liveVerifiedSurfaceFixture, staleSurfaceFixture } from './fixtures/status-fixtures.js';

describe('MCP surface and capability lifecycle guards', () => {
  it('accepts the evidence sequence from stale through live verification', () => {
    let machine = { state: 'stale' as const, history: ['stale' as const] };
    machine = transitionMcpSurfaceCarrierLifecycle(machine, 'restart_requested');
    machine = transitionMcpSurfaceCarrierLifecycle(machine, 'carrier_restarted');
    machine = transitionMcpSurfaceCarrierLifecycle(machine, 'live_verified');

    expect(machine.history).toEqual([
      'stale',
      'restart_requested',
      'carrier_restarted',
      'live_verified',
    ]);
    expect(() => assertMcpSurfaceCarrierLifecycleTransition('stale', 'live_verified'))
      .toThrow(/invalid_mcp_surface_carrier_lifecycle_transition/);
  });

  it('records validated status transitions without granting restart authority', () => {
    const restartStatus = projectMcpSurfaceCarrierStatus({
      ...staleSurfaceFixture,
      previousLifecycleState: 'stale',
    });
    expect(restartStatus.lifecycleTransition).toEqual({
      from: 'stale',
      to: 'restart_requested',
    });
    expect(restartStatus.packageRestartedCarrier).toBe(false);

    const liveStatus = projectMcpSurfaceCarrierStatus({
      ...liveVerifiedSurfaceFixture,
      previousLifecycleState: 'carrier_restarted',
    });
    expect(liveStatus.lifecycleTransition).toEqual({
      from: 'carrier_restarted',
      to: 'live_verified',
    });
  });

  it('requires capability admission to follow the declared order', () => {
    expect(transitionCapabilityLifecycle('cataloged', 'mcp_exposed')).toEqual({
      from: 'cataloged',
      to: 'mcp_exposed',
    });
    expect(transitionCapabilityLifecycle('mcp_exposed', 'admitted')).toEqual({
      from: 'mcp_exposed',
      to: 'admitted',
    });
    expect(() => assertCapabilityLifecycleTransition('cataloged', 'admitted'))
      .toThrow(/invalid_capability_lifecycle_transition/);
    expect(() => assertCapabilityLifecycleTransition('in_use', 'admitted'))
      .toThrow(/invalid_capability_lifecycle_transition/);
  });
});
