import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const REPOSITORY_PUBLICATION_OPERATION_NAMES = [
  'repository_publication.request.create',
  'repository_publication.request.list',
  'repository_publication.request.next',
  'repository_publication.admission.classify',
  'repository_publication.admission.list',
  'repository_publication.cloudflare_execution.readiness',
  'repository_publication.cloudflare_execution.execute',
  'repository_publication.cloudflare_execution.list',
  'repository_publication.evidence.put',
  'repository_publication.evidence.list',
  'repository_publication.provider_heartbeat.put',
  'repository_publication.provider_heartbeat.list',
];

export function createCloudflareRepositoryPublicationOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'repository-publication',
    authority: 'repository-publication',
    operations: REPOSITORY_PUBLICATION_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_REPOSITORY_PUBLICATION_OPERATION_NAMES = Object.freeze([...REPOSITORY_PUBLICATION_OPERATION_NAMES]);
