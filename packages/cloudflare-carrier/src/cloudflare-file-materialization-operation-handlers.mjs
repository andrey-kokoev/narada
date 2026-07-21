import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const FILE_MATERIALIZATION_OPERATION_NAMES = [
  'site_file_change_proposal.record',
  'site_file_change_proposal.list',
  'site_file_materialization.admit',
  'site_file_materialization.list',
];

export function createCloudflareFileMaterializationOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'file-materialization',
    authority: 'site-file-materialization',
    operations: FILE_MATERIALIZATION_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_FILE_MATERIALIZATION_OPERATION_NAMES = Object.freeze([...FILE_MATERIALIZATION_OPERATION_NAMES]);
