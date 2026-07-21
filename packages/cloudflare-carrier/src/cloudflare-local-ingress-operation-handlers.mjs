import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const LOCAL_INGRESS_OPERATION_NAMES = [
  'local_ingress.request.create',
  'local_ingress.request.list',
  'local_ingress.evidence.put',
  'local_ingress.evidence.list',
  'local_ingress.provider_heartbeat.put',
  'local_ingress.provider_heartbeat.list',
];

export function createCloudflareLocalIngressOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'local-ingress',
    authority: 'local-ingress',
    operations: LOCAL_INGRESS_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_LOCAL_INGRESS_OPERATION_NAMES = Object.freeze([...LOCAL_INGRESS_OPERATION_NAMES]);
