import { createCloudflareOperationRegistry } from './cloudflare-operation-registry.mjs';
import { createCloudflareSiteOperationHandlers } from './cloudflare-site-operation-handlers.mjs';
import { createCloudflareContinuityOperationHandlers } from './cloudflare-continuity-operation-handlers.mjs';
import { createCloudflareTaskLifecycleOperationHandlers } from './cloudflare-task-lifecycle-operation-handlers.mjs';
import { createCloudflareMailboxOperationHandlers } from './cloudflare-mailbox-operation-handlers.mjs';
import { createCloudflareLocalIngressOperationHandlers } from './cloudflare-local-ingress-operation-handlers.mjs';
import { createCloudflareRepositoryPublicationOperationHandlers } from './cloudflare-repository-publication-operation-handlers.mjs';
import { createCloudflareResidentDispatchOperationHandlers } from './cloudflare-resident-dispatch-operation-handlers.mjs';
import { createCloudflareWebhookDelayOperationHandlers } from './cloudflare-webhook-delay-operation-handlers.mjs';
import { createCloudflareFileMaterializationOperationHandlers } from './cloudflare-file-materialization-operation-handlers.mjs';

export const CLOUDFLARE_PRODUCT_OPERATION_CONTEXTS = Object.freeze([
  'site-operation-control',
  'continuity',
  'task-lifecycle',
  'mailbox',
  'local-ingress',
  'repository-publication',
  'resident-dispatch',
  'webhook-delay',
  'file-materialization',
]);

export function createCloudflareProductOperationRegistry({ dispatch } = {}) {
  if (typeof dispatch !== 'function') {
    throw new TypeError('cloudflare_product_operation_registry_missing_dispatch');
  }
  const definitions = [
    ...createCloudflareSiteOperationHandlers({ dispatch }),
    ...createCloudflareContinuityOperationHandlers({ dispatch }),
    ...createCloudflareTaskLifecycleOperationHandlers({ dispatch }),
    ...createCloudflareMailboxOperationHandlers({ dispatch }),
    ...createCloudflareLocalIngressOperationHandlers({ dispatch }),
    ...createCloudflareRepositoryPublicationOperationHandlers({ dispatch }),
    ...createCloudflareResidentDispatchOperationHandlers({ dispatch }),
    ...createCloudflareWebhookDelayOperationHandlers({ dispatch }),
    ...createCloudflareFileMaterializationOperationHandlers({ dispatch }),
  ];
  return createCloudflareOperationRegistry(definitions);
}
