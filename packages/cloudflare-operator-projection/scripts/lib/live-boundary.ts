export type RemoteCloudflareBoundary =
  | {
    ok: true;
    origin: string;
    hostname: string;
    deployment_boundary: 'remote_https_worker';
  }
  | {
    ok: false;
    code: string;
    message: string;
  };

const LOOPBACK_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map((value) => Number(value));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [first, second] = octets;
  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254);
}

/**
 * The `--live` smoke lane is a deployment claim. A local Worker emulator is
 * valuable coverage, but it must never be accepted as evidence for that
 * claim. Keep this guard close to the CLI boundary so every live script shares
 * the same remote-origin invariant.
 */
export function validateRemoteCloudflareApiBaseUrl(value: unknown): RemoteCloudflareBoundary {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      ok: false,
      code: 'remote_cloudflare_api_base_url_required',
      message: 'A deployed Cloudflare Worker URL is required for --live.',
    };
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return {
      ok: false,
      code: 'remote_cloudflare_api_base_url_invalid',
      message: 'The Cloudflare API base URL must be an absolute URL.',
    };
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') {
    return {
      ok: false,
      code: 'remote_cloudflare_api_base_url_requires_https',
      message: 'The --live Cloudflare API base URL must use HTTPS.',
    };
  }
  if (LOOPBACK_HOSTNAMES.has(hostname) || isPrivateIpv4(hostname) || hostname.endsWith('.local')) {
    return {
      ok: false,
      code: 'remote_cloudflare_api_base_url_loopback_refused',
      message: 'The --live Cloudflare API base URL must not resolve to loopback, private, or .local host space.',
    };
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    return {
      ok: false,
      code: 'remote_cloudflare_api_base_url_must_be_origin',
      message: 'The --live Cloudflare API base URL must be an origin without a path, query, or fragment.',
    };
  }

  return {
    ok: true,
    origin: url.origin,
    hostname,
    deployment_boundary: 'remote_https_worker',
  };
}
