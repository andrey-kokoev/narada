import { renderCloudflareCarrierConsole } from './cloudflare-operator-console.mjs';

export const CLOUDFLARE_OPERATOR_CONSOLE_ASSET = Object.freeze({
  content_type: 'text/html; charset=utf-8',
  cache_control: 'no-store',
});

/** Small Worker-facing delivery port for the independently testable console source. */
export function renderCloudflareOperatorConsoleAsset() {
  return {
    body: renderCloudflareCarrierConsole(),
    headers: CLOUDFLARE_OPERATOR_CONSOLE_ASSET,
  };
}
