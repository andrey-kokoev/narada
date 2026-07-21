import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const MAILBOX_OPERATION_NAMES = [
  'mailbox.status_shadow.record',
  'mailbox.status_shadow.list',
  'mailbox.status_source.read',
  'mailbox.status_source.list',
  'mailbox.draft_reply_proposal.record',
  'mailbox.draft_reply_proposal.list',
  'mailbox.outlook_draft.create',
  'mailbox.outlook_draft.list',
  'mailbox.outlook_draft.send',
  'mailbox.send_accepted.list',
  'mailbox.send_confirmation.read',
  'mailbox.send_confirmation.list',
  'mailbox.send_review.acknowledge',
  'mailbox.send_review.list',
];

export function createCloudflareMailboxOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'mailbox',
    authority: 'mailbox',
    operations: MAILBOX_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_MAILBOX_OPERATION_NAMES = Object.freeze([...MAILBOX_OPERATION_NAMES]);
