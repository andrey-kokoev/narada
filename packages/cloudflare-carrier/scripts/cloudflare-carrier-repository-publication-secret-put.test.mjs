import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REPOSITORY_PUBLICATION_SECRET_NAME,
  formatRepositoryPublicationSecretPutText,
  parseRepositoryPublicationSecretPutArgs,
  runRepositoryPublicationSecretPut,
} from './cloudflare-carrier-repository-publication-secret-put.mjs';

test('parseRepositoryPublicationSecretPutArgs accepts explicit token and text format', () => {
  const config = parseRepositoryPublicationSecretPutArgs([
    '--config', 'wrangler.preview.toml',
    '--token', 'ghp_test_token',
    '--format', 'text',
  ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' });

  assert.equal(config.format, 'text');
  assert.equal(config.configPath, 'wrangler.preview.toml');
  assert.equal(config.tokenValue, 'ghp_test_token');
  assert.equal(config.fromGhAuth, false);
});

test('runRepositoryPublicationSecretPut writes configured secret', async () => {
  const config = parseRepositoryPublicationSecretPutArgs([
    '--token', 'ghp_test_token',
  ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' });
  const calls = [];

  const result = await runRepositoryPublicationSecretPut(config, {
    secretWriter: async (request) => {
      calls.push(request);
      return { exitCode: 0 };
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.secret_name, REPOSITORY_PUBLICATION_SECRET_NAME);
  assert.equal(result.token_source, 'explicit_token_value');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].secretName, REPOSITORY_PUBLICATION_SECRET_NAME);
  assert.equal(calls[0].tokenValue, 'ghp_test_token');
});

test('formatRepositoryPublicationSecretPutText suppresses synthetic readiness follow-ons', () => {
  const output = formatRepositoryPublicationSecretPutText({
    status: 'ok',
    secret_name: REPOSITORY_PUBLICATION_SECRET_NAME,
    config_path: 'wrangler.toml',
    token_source: 'gh_auth_keyring',
  });

  assert.match(output, /Repository Publication Secret Put: ok/);
  assert.doesNotMatch(output, /<worker-url>/);
  assert.doesNotMatch(output, /Repository Publication Readiness Smoke:/);
  assert.doesNotMatch(output, /Repository Publication Provider Liveness:/);
});
