import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const SITE_OPERATION_NAMES = [
  'site.create',
  'site.read',
  'site.list',
  'site.settings.put',
  'site.membership.put',
  'operation.create',
  'operation.status.put',
  'operation.read',
  'operation.list',
  'operation_focus_review.acknowledge',
  'operation_focus_review.list',
];

export function createCloudflareSiteOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'site-operation-control',
    authority: 'site-membership',
    operations: SITE_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_SITE_OPERATION_NAMES = Object.freeze([...SITE_OPERATION_NAMES]);
