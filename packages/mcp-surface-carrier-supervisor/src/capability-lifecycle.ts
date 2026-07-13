import type { CapabilityLifecycleState } from './types.js';

export const CAPABILITY_LIFECYCLE_SCHEMA = 'narada.capability.lifecycle_state.v1' as const;

const orderedStates: readonly CapabilityLifecycleState[] = [
  'observed',
  'named',
  'designed',
  'implemented',
  'cataloged',
  'mcp_exposed',
  'admitted',
  'trialed',
  'in_use',
];

export interface CapabilityLifecycleTransition {
  from: CapabilityLifecycleState;
  to: CapabilityLifecycleState;
}

export function canTransitionCapabilityLifecycle(
  from: CapabilityLifecycleState,
  to: CapabilityLifecycleState,
): boolean {
  if (from === to) return true;
  if (to === 'blocked') return from !== 'blocked';
  if (from === 'blocked') return to === 'observed';
  return orderedStates[orderedStates.indexOf(from) + 1] === to;
}

export function assertCapabilityLifecycleTransition(
  from: CapabilityLifecycleState,
  to: CapabilityLifecycleState,
): void {
  if (!canTransitionCapabilityLifecycle(from, to)) {
    throw new Error(`invalid_capability_lifecycle_transition: ${from} -> ${to}`);
  }
}

export function transitionCapabilityLifecycle(
  from: CapabilityLifecycleState,
  to: CapabilityLifecycleState,
): CapabilityLifecycleTransition | undefined {
  assertCapabilityLifecycleTransition(from, to);
  return from === to ? undefined : { from, to };
}
