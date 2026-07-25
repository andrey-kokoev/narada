export const CONCEPT_PROTOCOL_LIFECYCLE_SCHEMA: any = 'narada.concept_protocol.lifecycle_state.v1';

const lifecycleStates: any = [
  'observed',
  'named',
  'doctrine_checked',
  'codified',
  'trialed',
  'promoted',
  'canonical',
  'deprecated',
  'rejected',
  'superseded',
];

const eventTargets: any = {
  observed: 'observed',
  named: 'named',
  doctrine_checked: 'doctrine_checked',
  codified: 'codified',
  trialed: 'trialed',
  promoted: 'promoted',
  canonicalized: 'canonical',
  deprecated: 'deprecated',
  rejected: 'rejected',
  superseded: 'superseded',
};

const allowedTransitions: any = {
  null: ['observed'],
  observed: ['named', 'rejected'],
  named: ['doctrine_checked', 'rejected'],
  doctrine_checked: ['codified', 'rejected'],
  codified: ['trialed', 'rejected'],
  trialed: ['promoted', 'rejected'],
  promoted: ['canonical', 'rejected'],
  canonical: ['deprecated', 'superseded'],
  deprecated: ['superseded'],
  rejected: [],
  superseded: [],
};

export function canTransitionConceptProtocolLifecycle(previousState: any, nextState: any, eventType: any) {
  if (!lifecycleStates.includes(nextState)) return false;
  if (eventType === 'corrected') {
    return previousState !== null
      && previousState !== 'rejected'
      && previousState !== 'superseded'
      && previousState === nextState;
  }
  if (eventTargets[eventType] !== nextState) return false;
  return (allowedTransitions[String(previousState)] ?? []).includes(nextState);
}

export function assertConceptProtocolLifecycleTransition({ previousState, nextState, eventType }: any) {
  if (!canTransitionConceptProtocolLifecycle(previousState, nextState, eventType)) {
    throw new Error(
      `invalid_concept_protocol_lifecycle_transition: ${previousState ?? 'none'} -> ${nextState} (${eventType})`,
    );
  }
}
