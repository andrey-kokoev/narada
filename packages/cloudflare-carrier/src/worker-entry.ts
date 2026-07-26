import {
  CloudflareCarrierDurableObject,
  handleCloudflareScheduled,
  handleCloudflareWorkerRequest,
} from './cloudflare-worker.ts';

export {
  CloudflareCarrierDurableObject,
  handleCloudflareScheduled,
  handleCloudflareWorkerRequest,
};

export default {
  fetch: handleCloudflareWorkerRequest,
  scheduled: handleCloudflareScheduled,
};
