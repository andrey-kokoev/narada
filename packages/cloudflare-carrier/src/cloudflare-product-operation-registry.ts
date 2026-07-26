import { createCloudflareOperationRegistry } from './cloudflare-operation-registry.ts';
import { createCloudflareSiteOperationHandlers } from './cloudflare-site-operation-handlers.ts';
import { createCloudflareContinuityOperationHandlers } from './cloudflare-continuity-operation-handlers.ts';
import { createCloudflareTaskLifecycleOperationHandlers } from './cloudflare-task-lifecycle-operation-handlers.ts';
import { createCloudflareMailboxOperationHandlers } from './cloudflare-mailbox-operation-handlers.ts';
import { createCloudflareLocalIngressOperationHandlers } from './cloudflare-local-ingress-operation-handlers.ts';
import { createCloudflareRepositoryPublicationOperationHandlers } from './cloudflare-repository-publication-operation-handlers.ts';
import { createCloudflareResidentDispatchOperationHandlers } from './cloudflare-resident-dispatch-operation-handlers.ts';
import { createCloudflareWebhookDelayOperationHandlers } from './cloudflare-webhook-delay-operation-handlers.ts';
import { createCloudflareFileMaterializationOperationHandlers } from './cloudflare-file-materialization-operation-handlers.ts';

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

export function createCloudflareProductOperationRegistry({ dispatch }: any= {}) {
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