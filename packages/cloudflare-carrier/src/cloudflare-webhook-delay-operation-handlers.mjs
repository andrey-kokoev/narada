import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const WEBHOOK_DELAY_OPERATION_NAMES = [
  'webhook_delay.shadow_read.record',
  'webhook_delay.shadow_read.list',
  'webhook_delay.observation.primary_with_fallback.record',
  'webhook_delay.observation.primary_with_fallback.list',
  'webhook_delay.remote_source.samples.put',
  'webhook_delay.remote_source.primary_with_fallback.read',
  'webhook_delay.remote_source.samples.list',
  'webhook_delay.remote_metric.direct_source.read',
  'webhook_delay.remote_source.scheduled_read.run',
  'webhook_delay.remote_source.scheduled_read.list',
  'webhook_delay.directive.dual_record.record',
  'webhook_delay.directive.dual_record.list',
  'webhook_delay.directive.primary_with_fallback.deliver',
  'webhook_delay.directive.primary_with_fallback.list',
];

export function createCloudflareWebhookDelayOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'webhook-delay',
    authority: 'webhook-delay',
    operations: WEBHOOK_DELAY_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_WEBHOOK_DELAY_OPERATION_NAMES = Object.freeze([...WEBHOOK_DELAY_OPERATION_NAMES]);
