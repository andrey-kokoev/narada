import {
  CloudflareCarrierDurableObject,
  handleCloudflareScheduled,
  handleCloudflareWorkerRequest,
} from './cloudflare-worker.mjs';

export {
  CloudflareCarrierDurableObject,
  handleCloudflareScheduled,
  handleCloudflareWorkerRequest,
};

export default {
  fetch: handleCloudflareWorkerRequest,
  scheduled: handleCloudflareScheduled,
};
