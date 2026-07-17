import {
  OPERATOR_INPUT_TRANSITIONS,
  canTransitionOperatorInput,
  transitionOperatorInputLifecycle,
} from '../operator-input-lifecycle.js';

export const PENDING_OPERATOR_INPUT_PHASES = Object.freeze({
  SENT: 'sent',
  RELAY_PENDING: 'relay_pending',
  TIMED_OUT: 'timed_out',
  REVIEWING: 'reviewing',
  RETRIED: 'retried',
});

export type PendingOperatorInputPhase = typeof PENDING_OPERATOR_INPUT_PHASES[keyof typeof PENDING_OPERATOR_INPUT_PHASES];

const pendingPhaseValues = new Set(Object.values(PENDING_OPERATOR_INPUT_PHASES));
export const PENDING_OPERATOR_INPUT_TRANSITIONS: Readonly<Record<PendingOperatorInputPhase, readonly PendingOperatorInputPhase[]>> = Object.freeze(
  Object.fromEntries(Object.values(PENDING_OPERATOR_INPUT_PHASES).map((phase) => [
    phase,
    Object.freeze((OPERATOR_INPUT_TRANSITIONS[phase] ?? []).filter((nextPhase: string) => pendingPhaseValues.has(nextPhase as PendingOperatorInputPhase))) as readonly PendingOperatorInputPhase[],
  ])),
) as Readonly<Record<PendingOperatorInputPhase, readonly PendingOperatorInputPhase[]>>;

export function canTransitionPendingOperatorInput(
  from: PendingOperatorInputPhase,
  to: PendingOperatorInputPhase,
): boolean {
  return pendingPhaseValues.has(from) && pendingPhaseValues.has(to) && canTransitionOperatorInput(from, to);
}

export interface PendingOperatorInputLifecycle {
  phase: PendingOperatorInputPhase;
  updated_at: string;
}

export function transitionPendingOperatorInput(
  lifecycle: PendingOperatorInputLifecycle,
  phase: PendingOperatorInputPhase,
  updatedAt = new Date().toISOString(),
): boolean {
  if (!canTransitionPendingOperatorInput(lifecycle.phase, phase)) return false;
  return transitionOperatorInputLifecycle(lifecycle, phase, updatedAt);
}
