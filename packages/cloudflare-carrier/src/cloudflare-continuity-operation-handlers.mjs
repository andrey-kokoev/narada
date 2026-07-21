import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const CONTINUITY_OPERATION_NAMES = [
  'site.continuity.packet.publish',
  'site.continuity.packet.put',
  'site.continuity.loop.report.put',
  'site.continuity.reconciliation_execution.put',
  'resident_loop.shadow_read.record',
  'resident_loop.shadow_read.list',
  'task_lifecycle.shadow_read.record',
  'task_lifecycle.shadow_read.list',
  'task_lifecycle.shadow_read.source.read',
];

export function createCloudflareContinuityOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'continuity',
    authority: 'site-continuity',
    operations: CONTINUITY_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_CONTINUITY_OPERATION_NAMES = Object.freeze([...CONTINUITY_OPERATION_NAMES]);
