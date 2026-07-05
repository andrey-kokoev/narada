import * as NarsClientProjectionContract from '@narada2/nars-client-projection-contract';

const contract = NarsClientProjectionContract as unknown as Record<string, () => unknown>;

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

export function buildSurfaceFeedbackSummaryRequestFrame() {
  return contract.buildAgentWebUiSurfaceFeedbackSummaryFrame();
}
