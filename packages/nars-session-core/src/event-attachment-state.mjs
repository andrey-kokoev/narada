export const NARS_EVENT_ATTACHMENT_STATE_SCHEMA = 'narada.nars.event_attachment_state.v1';

export const NARS_EVENT_ATTACHMENT_STATES = Object.freeze([
  'requested',
  'replaying',
  'live',
  'closing',
  'closed',
  'failed',
]);

export const NARS_EVENT_ATTACHMENT_TERMINAL_STATES = Object.freeze(['closed', 'failed']);

export const NARS_EVENT_ATTACHMENT_TRANSITIONS = Object.freeze({
  requested: Object.freeze(['replaying', 'live', 'closing', 'failed']),
  replaying: Object.freeze(['live', 'closing', 'failed']),
  live: Object.freeze(['closing', 'failed']),
  closing: Object.freeze(['closed', 'failed']),
  closed: Object.freeze([]),
  failed: Object.freeze([]),
});

const STATE_SET = new Set(NARS_EVENT_ATTACHMENT_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_EVENT_ATTACHMENT_TRANSITIONS).map(([state, nextStates]) => [state, new Set(nextStates)]),
);

export function canTransitionNarsEventAttachment(previousState, nextState) {
  if (!STATE_SET.has(nextState)) return false;
  if (previousState === nextState) return true;
  return TRANSITION_SET.get(previousState)?.has(nextState) ?? false;
}

export function assertNarsEventAttachmentTransition(previousState, nextState) {
  if (!canTransitionNarsEventAttachment(previousState, nextState)) {
    throw new Error(`invalid_nars_event_attachment_transition:${previousState}:${nextState}`);
  }
  return nextState;
}

export function createNarsEventAttachmentStateMachine({ attachmentId, onTransition = null } = {}) {
  if (!attachmentId) throw new Error('nars_event_attachment_id_required');
  let state = 'requested';
  const history = [{
    schema: NARS_EVENT_ATTACHMENT_STATE_SCHEMA,
    attachment_id: String(attachmentId),
    previous_state: null,
    attachment_state: state,
    evidence: { reason: 'subscription_requested' },
  }];
  return Object.freeze({
    get state() { return state; },
    get history() { return history.map((entry) => ({ ...entry, evidence: { ...entry.evidence } })); },
    transition(nextState, evidence = {}) {
      assertNarsEventAttachmentTransition(state, nextState);
      if (nextState === state) return history.at(-1);
      const transition = {
        schema: NARS_EVENT_ATTACHMENT_STATE_SCHEMA,
        attachment_id: String(attachmentId),
        previous_state: state,
        attachment_state: nextState,
        evidence: { ...evidence },
      };
      state = nextState;
      history.push(transition);
      onTransition?.(transition);
      return transition;
    },
  });
}

