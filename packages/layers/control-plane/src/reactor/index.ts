/**
 * Reactor Pattern Public API
 *
 * Fact consumers that evaluate against a charter and may propose effects.
 */

export type {
  Reactor,
  ReactorId,
  ReactorCharter,
  ReactorTrigger,
  ReactorRule,
  ReactorRuleCondition,
  ReactorRuleConsequence,
  ReactorProposalKind,
  ReactorConfidence,
  ReactorInput,
  ReactorOutput,
  ReactorProposal,
  ReactorGovernanceResult,
} from "./types.js";

export {
  DefaultReactorRegistry,
  type ReactorRegistry,
  type ReactorRegistryOptions,
} from "./registry.js";

export {
  InKernelReactor,
  type InKernelReactorOptions,
} from "./evaluator.js";

export {
  AgentReactorBridge,
  type AgentReactorRuntime,
  type AgentReactorBridgeOptions,
} from "./agent-bridge.js";

export {
  governReactorOutput,
  type ReactorGovernanceOptions,
} from "./governance.js";

export {
  materializeProposal,
  materializeApprovedProposals,
  type MaterializeProposalOptions,
} from "./proposals.js";

export {
  buildReactorOutputRow,
  persistReactorOutput,
} from "./persist.js";

export {
  NodeSqliteReactorOutputStore,
} from "./store-node-sqlite.js";
