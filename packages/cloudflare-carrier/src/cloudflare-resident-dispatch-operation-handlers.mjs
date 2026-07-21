import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const RESIDENT_DISPATCH_OPERATION_NAMES = [
  'resident_dispatch.primary_with_fallback.start',
  'resident_dispatch.primary_with_fallback.list',
  'resident_dispatch.windows_fallback_request.create',
  'resident_dispatch.windows_fallback_request.list',
  'resident_dispatch.windows_fallback_evidence.put',
  'resident_dispatch.windows_fallback_evidence.list',
  'resident_dispatch.local_resident_carrier_bridge.put',
  'resident_dispatch.local_resident_carrier_bridge.list',
];

export function createCloudflareResidentDispatchOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'resident-dispatch',
    authority: 'resident-dispatch',
    operations: RESIDENT_DISPATCH_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_RESIDENT_DISPATCH_OPERATION_NAMES = Object.freeze([...RESIDENT_DISPATCH_OPERATION_NAMES]);
