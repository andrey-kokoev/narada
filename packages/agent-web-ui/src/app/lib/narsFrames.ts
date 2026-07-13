import * as NarsClientProjectionContract from '@narada2/nars-client-projection-contract';
import { toSessionProtocolFrame, type SessionProtocolFrame } from '../../protocol/sessionTransport';

const contract = NarsClientProjectionContract as unknown as Record<string, (...args: unknown[]) => unknown>;

function frameFromContract(value: unknown): SessionProtocolFrame | null {
  return toSessionProtocolFrame(value);
}

export function buildSopSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiSopSummaryFrame());
}

export function buildInboxSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiInboxSummaryFrame());
}

export function buildDelegationSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiDelegationSummaryFrame());
}

export function buildGitSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiGitSummaryFrame());
}

export function buildArtifactsSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiArtifactsSummaryFrame());
}

export function buildMailboxSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiMailboxSummaryFrame());
}

export function buildSchedulerSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiSchedulerSummaryFrame());
}

export function buildTaskLifecycleSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiTaskLifecycleSummaryFrame());
}

export function buildSurfaceAffordancesRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiSurfaceAffordancesFrame());
}

export function buildIntelligenceReconfigureFrame(input: Record<string, unknown>, options: Record<string, unknown> = {}): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiIntelligenceReconfigureFrame(input, options));
}

export function buildAffordanceActionRequestFrame(input: Record<string, unknown>, options: Record<string, unknown> = {}): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiAffordanceActionRequestFrame(input, options));
}

export function buildAffordanceActionConfirmFrame(input: Record<string, unknown>, options: Record<string, unknown> = {}): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiAffordanceActionConfirmFrame(input, options));
}

export function buildAffordanceActionCancelFrame(input: Record<string, unknown>, options: Record<string, unknown> = {}): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiAffordanceActionCancelFrame(input, options));
}

export function buildSurfaceFeedbackSummaryRequestFrame(): SessionProtocolFrame | null {
  return frameFromContract(contract.buildAgentWebUiSurfaceFeedbackSummaryFrame());
}