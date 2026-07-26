export const NARS_EVENT_ATTACHMENT_STATE_SCHEMA = 'narada.nars.event_attachment_state.v1' as const;

export const NARS_EVENT_ATTACHMENT_STATES = Object.freeze([
  'requested',
  'replaying',
  'live',
  'closing',
  'closed',
  'failed',
 ] as const);
export type NaradaEventAttachmentState = (typeof NARS_EVENT_ATTACHMENT_STATES)[number];

export const NARS_EVENT_ATTACHMENT_TERMINAL_STATES = Object.freeze(['closed', 'failed'] as const);

export const NARS_EVENT_ATTACHMENT_TRANSITIONS = Object.freeze({
  requested: ['replaying', 'live', 'closing', 'failed'],
  replaying: ['live', 'closing', 'failed'],
  live: ['closing', 'failed'],
  closing: ['closed', 'failed'],
  closed: [],
  failed: [],
} as const);

export interface NaradaEventAttachmentTransition {
  schema: typeof NARS_EVENT_ATTACHMENT_STATE_SCHEMA;
  attachment_id: string;
  previous_state: NaradaEventAttachmentState | null;
  attachment_state: NaradaEventAttachmentState;
  evidence: Record<string, unknown>;
}

export interface NaradaEventAttachmentStateMachine {
  readonly state: NaradaEventAttachmentState;
  readonly history: NaradaEventAttachmentTransition[];
  transition(nextState: NaradaEventAttachmentState, evidence?: Record<string, unknown>): NaradaEventAttachmentTransition;
}

const STATE_SET = new Set<NaradaEventAttachmentState>(NARS_EVENT_ATTACHMENT_STATES);
const TRANSITION_SET = new Map(
  Object.entries(NARS_EVENT_ATTACHMENT_TRANSITIONS).map(([state, nextStates]) => [
    state as NaradaEventAttachmentState,
    new Set<NaradaEventAttachmentState>(nextStates),
  ]),
);

export function canTransitionNarsEventAttachment(previousState: unknown, nextState: unknown): boolean {
  if (typeof nextState !== 'string' || !STATE_SET.has(nextState as NaradaEventAttachmentState)) return false;
  if (previousState === nextState) return true;
  if (typeof previousState !== 'string' || !STATE_SET.has(previousState as NaradaEventAttachmentState)) return false;
  return TRANSITION_SET.get(previousState as NaradaEventAttachmentState)?.has(nextState as NaradaEventAttachmentState) ?? false;
}

export function assertNarsEventAttachmentTransition(previousState: unknown, nextState: unknown): asserts nextState is NaradaEventAttachmentState {
  if (!canTransitionNarsEventAttachment(previousState, nextState)) {
    throw new Error(`invalid_nars_event_attachment_transition:${previousState}:${nextState}`);
  }
}

export function createNarsEventAttachmentStateMachine({
  attachmentId,
  onTransition = null,
}: { attachmentId?: string | null; onTransition?: ((transition: NaradaEventAttachmentTransition) => void) | null } = {}): NaradaEventAttachmentStateMachine {
  if (!attachmentId) throw new Error('nars_event_attachment_id_required');
  let state: NaradaEventAttachmentState = 'requested';
  const history: NaradaEventAttachmentTransition[] = [{
    schema: NARS_EVENT_ATTACHMENT_STATE_SCHEMA,
    attachment_id: String(attachmentId),
    previous_state: null,
    attachment_state: state,
    evidence: { reason: 'subscription_requested' },
  }];
  return Object.freeze({
    get state() { return state; },
    get history() { return history.map((entry) => ({ ...entry, evidence: { ...entry.evidence } })); },
    transition(nextState: NaradaEventAttachmentState, evidence: Record<string, unknown> = {}) {
      assertNarsEventAttachmentTransition(state, nextState);
      if (nextState === state) return history.at(-1);
      const transition: NaradaEventAttachmentTransition = {
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
  }) as NaradaEventAttachmentStateMachine;
}

