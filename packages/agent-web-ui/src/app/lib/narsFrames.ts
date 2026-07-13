import * as NarsClientProjectionContract from '@narada2/nars-client-projection-contract';
import { toSessionProtocolFrame, type SessionProtocolFrame } from '../../protocol/sessionTransport';

const contract = NarsClientProjectionContract as unknown as Record<string, (...args: unknown[]) => unknown>;

export function buildSopSummaryRequestFrame() {
  return contract.buildAgentWebUiSopSummaryFrame();
}

export function buildInboxSummaryRequestFrame() {
  return contract.buildAgentWebUiInboxSummaryFrame();
}

export function buildDelegationSummaryRequestFrame() {
  return contract.buildAgentWebUiDelegationSummaryFrame();
}

export function buildGitSummaryRequestFrame() {
  return contract.buildAgentWebUiGitSummaryFrame();
}

export function buildArtifactsSummaryRequestFrame() {
  return contract.buildAgentWebUiArtifactsSummaryFrame();
}

export function buildMailboxSummaryRequestFrame() {
  return contract.buildAgentWebUiMailboxSummaryFrame();
}

export function buildSchedulerSummaryRequestFrame() {
  return contract.buildAgentWebUiSchedulerSummaryFrame();
}

export function buildTaskLifecycleSummaryRequestFrame() {
  return contract.buildAgentWebUiTaskLifecycleSummaryFrame();
}

export function buildSurfaceAffordancesRequestFrame() {
  return contract.buildAgentWebUiSurfaceAffordancesFrame();
}

export function buildIntelligenceReconfigureFrame(input: Record<string, unknown>, options: Record<string, unknown> = {}): SessionProtocolFrame | null {
  return toSessionProtocolFrame(contract.buildAgentWebUiIntelligenceReconfigureFrame(input, options));
}

export function buildAffordanceActionRequestFrame(input: Record<string, unknown>, options: Record<string, unknown> = {}) {
  return contract.buildAgentWebUiAffordanceActionRequestFrame(input, options);
}

export function buildAffordanceActionConfirmFrame(input: Record<string, unknown>, options: Record<string, unknown> = {}) {
  return contract.buildAgentWebUiAffordanceActionConfirmFrame(input, options);
}

export function buildAffordanceActionCancelFrame(input: Record<string, unknown>, options: Record<string, unknown> = {}) {
  return contract.buildAgentWebUiAffordanceActionCancelFrame(input, options);
}

export function buildSurfaceFeedbackSummaryRequestFrame() {
  return contract.buildAgentWebUiSurfaceFeedbackSummaryFrame();
}
