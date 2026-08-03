import { describe, expect, test } from 'vitest';
import { validateRemoteCloudflareApiBaseUrl } from '../scripts/lib/live-boundary.js';

describe('Cloudflare live-smoke deployment boundary', () => {
  test('accepts a public HTTPS Worker origin', () => {
    expect(validateRemoteCloudflareApiBaseUrl('https://narada-operator-projection.andrei-kokoev.workers.dev/')).toEqual({
      ok: true,
      origin: 'https://narada-operator-projection.andrei-kokoev.workers.dev',
      hostname: 'narada-operator-projection.andrei-kokoev.workers.dev',
      deployment_boundary: 'remote_https_worker',
    });
  });

  test.each([
    ['http://narada.example.test', 'remote_cloudflare_api_base_url_requires_https'],
    ['http://127.0.0.1:8787', 'remote_cloudflare_api_base_url_requires_https'],
    ['https://127.0.0.1:8787', 'remote_cloudflare_api_base_url_loopback_refused'],
    ['https://localhost:8787', 'remote_cloudflare_api_base_url_loopback_refused'],
    ['https://projection.local', 'remote_cloudflare_api_base_url_loopback_refused'],
    ['https://narada.example.test/api', 'remote_cloudflare_api_base_url_must_be_origin'],
  ])('refuses %s as deployed evidence (%s)', (value, code) => {
    expect(validateRemoteCloudflareApiBaseUrl(value)).toMatchObject({ ok: false, code });
  });

  test('refuses malformed and absent values', () => {
    expect(validateRemoteCloudflareApiBaseUrl(undefined)).toMatchObject({
      ok: false,
      code: 'remote_cloudflare_api_base_url_required',
    });
    expect(validateRemoteCloudflareApiBaseUrl('not a url')).toMatchObject({
      ok: false,
      code: 'remote_cloudflare_api_base_url_invalid',
    });
  });
});
