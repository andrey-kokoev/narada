import type { OperatorSiteAgentWireRecord } from '@narada2/operator-console-contract';

export type AgentPrimaryDecision =
  | { kind: 'ensure-running' }
  | { kind: 'unavailable'; reason: string };

export type AgentInspectionDecision =
  | { kind: 'open-session'; sessionId: string }
  | { kind: 'choose-session' }
  | { kind: 'unavailable'; reason: string };

export function decideAgentPrimaryAction(agent: OperatorSiteAgentWireRecord): AgentPrimaryDecision {
  if (agent.runtime.state === 'stopped' || agent.runtime.state === 'running') return { kind: 'ensure-running' };
  return {
    kind: 'unavailable',
    reason: agent.runtime.state === 'ambiguous'
      ? 'Multiple healthy sessions exist. Choose one from Agent Sessions.'
      : 'The existing runtime is degraded. Inspect or recover it before starting another.',
  };
}

export function decideAgentInspection(agent: OperatorSiteAgentWireRecord): AgentInspectionDecision {
  if (agent.runtime.state === 'running' && agent.runtime.selected_session_id) {
    return { kind: 'open-session', sessionId: agent.runtime.selected_session_id };
  }
  if (agent.runtime.state === 'ambiguous') return { kind: 'choose-session' };
  return {
    kind: 'unavailable',
    reason: agent.actions.inspect_reason ?? 'No single healthy session is available.',
  };
}
