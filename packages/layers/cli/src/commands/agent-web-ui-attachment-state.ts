export const AGENT_WEB_UI_ATTACHMENT_LIFECYCLE_SCHEMA = 'narada.agent_web_ui.attachment.lifecycle_state.v1' as const;

export const AGENT_WEB_UI_ATTACHMENT_STATES = [
  'requested',
  'discovering',
  'waiting_for_session',
  'resolving_endpoints',
  'probing_health',
  'registering_projection',
  'attached',
  'refused',
  'expired',
  'detached',
] as const;

export type AgentWebUiAttachmentState = typeof AGENT_WEB_UI_ATTACHMENT_STATES[number];
export interface AgentWebUiAttachmentLifecycle {
  schema: typeof AGENT_WEB_UI_ATTACHMENT_LIFECYCLE_SCHEMA;
  state: AgentWebUiAttachmentState;
  history: readonly AgentWebUiAttachmentState[];
}

const transitions: Record<AgentWebUiAttachmentState, readonly AgentWebUiAttachmentState[]> = {
  requested: ['discovering', 'refused'],
  discovering: ['waiting_for_session', 'resolving_endpoints', 'refused'],
  waiting_for_session: ['discovering', 'resolving_endpoints', 'expired', 'refused'],
  resolving_endpoints: ['probing_health', 'refused', 'expired'],
  probing_health: ['registering_projection', 'refused', 'expired'],
  registering_projection: ['attached', 'refused', 'expired'],
  attached: ['expired', 'detached'],
  refused: [],
  expired: [],
  detached: [],
};

export function createAgentWebUiAttachmentLifecycle(initialState: AgentWebUiAttachmentState = 'requested'): AgentWebUiAttachmentLifecycle {
  assertAgentWebUiAttachmentState(initialState);
  return { schema: AGENT_WEB_UI_ATTACHMENT_LIFECYCLE_SCHEMA, state: initialState, history: [initialState] };
}

export function canTransitionAgentWebUiAttachment(from: AgentWebUiAttachmentState, to: AgentWebUiAttachmentState): boolean {
  assertAgentWebUiAttachmentState(from);
  assertAgentWebUiAttachmentState(to);
  return from === to || transitions[from].includes(to);
}

export function assertAgentWebUiAttachmentTransition(from: AgentWebUiAttachmentState, to: AgentWebUiAttachmentState): void {
  if (!canTransitionAgentWebUiAttachment(from, to)) {
    throw new Error(`invalid_agent_web_ui_attachment_transition: ${from}->${to}`);
  }
}

export function transitionAgentWebUiAttachment(
  lifecycle: AgentWebUiAttachmentLifecycle,
  nextState: AgentWebUiAttachmentState,
): AgentWebUiAttachmentLifecycle {
  assertAgentWebUiAttachmentTransition(lifecycle.state, nextState);
  return lifecycle.state === nextState
    ? lifecycle
    : {
      schema: AGENT_WEB_UI_ATTACHMENT_LIFECYCLE_SCHEMA,
      state: nextState,
      history: [...lifecycle.history, nextState],
    };
}

export function isTerminalAgentWebUiAttachmentState(state: AgentWebUiAttachmentState): boolean {
  assertAgentWebUiAttachmentState(state);
  return state === 'refused' || state === 'expired' || state === 'detached';
}

function assertAgentWebUiAttachmentState(state: string): asserts state is AgentWebUiAttachmentState {
  if (!(AGENT_WEB_UI_ATTACHMENT_STATES as readonly string[]).includes(state)) {
    throw new Error(`unsupported_agent_web_ui_attachment_state: ${state}`);
  }
}
