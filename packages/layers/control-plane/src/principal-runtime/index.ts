/**
 * Principal Runtime module
 *
 * Ephemeral state machine for runtime actors.
 */

export type {
  PrincipalRuntime,
  PrincipalRuntimeState,
  PrincipalAttachmentMode,
  PrincipalType,
  CreatePrincipalRuntimeInput,
  PrincipalRuntimeHealth,
  PrincipalRuntimeSnapshot,
} from "./types.js";

export {
  isValidTransition as isValidPrincipalRuntimeTransition,
  validNextStates,
  canClaimWork,
  canExecute,
  isAttached,
  hasActiveWork,
  isTerminalState,
  transitionState,
  attachPrincipal,
  detachPrincipal,
  markStale,
  getPrincipalHealth,
  toSnapshot,
  createPrincipalRuntime,
} from "./state-machine.js";

export {
  PrincipalRuntimeRegistry,
  InMemoryPrincipalRuntimeRegistry,
  JsonPrincipalRuntimeRegistry,
} from "./registry.js";
