/**
 * Transitional export surface for callers that still use the carrier vocabulary.
 * Runtime lifecycle implementation belongs to the operator-surface module.
 */
export {
  operatorSurfaceRuntimeControlPathCommand as carrierControlPathCommand,
  operatorSurfaceRuntimeDrainCommand as carrierDrainCommand,
  operatorSurfaceRuntimeReadinessCommand as carrierReadinessCommand,
  operatorSurfaceRuntimeReloadCommand as carrierReloadCommand,
  operatorSurfaceRuntimeRestartCommand as carrierRestartCommand,
  operatorSurfaceRuntimeStatusCommand as carrierStatusCommand,
} from './operator-surface-runtime-lifecycle.js';
export { operatorSurfaceRuntimeStartCommand as carrierStartCommand } from './operator-surface-runtime-start.js';
export type { OperatorSurfaceRuntimeStartOptions as CarrierCommandOptions } from './operator-surface-runtime-start.js';
