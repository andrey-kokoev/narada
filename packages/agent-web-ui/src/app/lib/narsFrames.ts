import * as NarsClientProjectionContract from '@narada2/nars-client-projection-contract';

const contract = NarsClientProjectionContract as unknown as Record<string, () => unknown>;

export function buildSopSummaryRequestFrame() {
  return contract.buildAgentWebUiSopSummaryFrame();
}

export function buildSurfaceAffordancesRequestFrame() {
  return contract.buildAgentWebUiSurfaceAffordancesFrame();
}
