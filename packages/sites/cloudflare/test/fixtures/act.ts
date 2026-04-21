export interface ActFixture {
  decisionId: string;
  contextId: string;
  scopeId: string;
  approvedAction: string;
  outboundId: string | null;
}

export function createActFixture(overrides?: Partial<ActFixture>): ActFixture {
  return {
    decisionId: "dec-001",
    contextId: "ctx-001",
    scopeId: "scope-001",
    approvedAction: "draft_reply",
    outboundId: "ob-001",
    ...overrides,
  };
}
