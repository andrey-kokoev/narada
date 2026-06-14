import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES,
  formatGithubAppSecretPutText,
  formatGithubAppSecretPutError,
  installGithubAppSecrets,
  parseGithubAppSecretPutArgs,
} from './cloudflare-carrier-repository-publication-github-app-secret-put.mjs';

const privateKey = '-----BEGIN PRIVATE KEY-----\\nredacted-test-key\\n-----END PRIVATE KEY-----';

test('parseGithubAppSecretPutArgs normalizes complete CLI configuration', () => {
  const config = parseGithubAppSecretPutArgs([
    '--config', 'wrangler.preview.toml',
    '--app-id', '12345',
    '--installation-id', '67890',
    '--private-key', privateKey,
  ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' });

  assert.equal(config.configPath, 'wrangler.preview.toml');
  assert.equal(config.format, 'json');
  assert.equal(config.packageRoot, 'D:/repo/packages/cloudflare-carrier');
  assert.deepEqual(config.secrets.map((secret) => secret.secretName), [
    REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.appId,
    REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.installationId,
    REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.privateKey,
  ]);
  assert.equal(config.secrets[2].value, privateKey.replace(/\\n/g, '\n'));
});

test('parseGithubAppSecretPutArgs accepts text format', () => {
  const config = parseGithubAppSecretPutArgs([
    '--app-id', '12345',
    '--installation-id', '67890',
    '--private-key', privateKey,
    '--format', 'text',
  ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' });

  assert.equal(config.format, 'text');
});

test('parseGithubAppSecretPutArgs refuses invalid credential shape', () => {
  assert.throws(
    () => parseGithubAppSecretPutArgs([
      '--app-id', 'app-id',
      '--installation-id', '67890',
      '--private-key', privateKey,
    ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' }),
    /repository publication GitHub App id must be numeric/,
  );

  assert.throws(
    () => parseGithubAppSecretPutArgs([
      '--app-id', '12345',
      '--installation-id', 'install',
      '--private-key', privateKey,
    ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' }),
    /repository publication GitHub App installation id must be numeric/,
  );

  assert.throws(
    () => parseGithubAppSecretPutArgs([
      '--app-id', '12345',
      '--installation-id', '67890',
      '--private-key', 'not-a-pem',
    ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' }),
    /repository publication GitHub App private key must be PKCS8 PEM/,
  );
});

test('installGithubAppSecrets writes all secrets without exposing values', async () => {
  const config = parseGithubAppSecretPutArgs([
    '--app-id', '12345',
    '--installation-id', '67890',
    '--private-key', privateKey,
  ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' });
  const calls = [];

  const result = await installGithubAppSecrets(config, async (request) => {
    calls.push({
      secretName: request.secretName,
      configPath: request.configPath,
      packageRoot: request.packageRoot,
      redactions: request.redactions,
      value: request.value,
    });
    return { exitCode: 0, stdout: '', stderr: '', spawnError: null };
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.installed.length, 3);
  assert.deepEqual(calls.map((call) => call.secretName), [
    REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.appId,
    REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.installationId,
    REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.privateKey,
  ]);
  assert.equal(calls.every((call) => call.redactions.includes(call.value)), true);
});

test('installGithubAppSecrets preserves sanitized writer failure evidence', async () => {
  const config = parseGithubAppSecretPutArgs([
    '--app-id', '12345',
    '--installation-id', '67890',
    '--private-key', privateKey,
  ], {}, { packageRoot: 'D:/repo/packages/cloudflare-carrier', repoRoot: 'D:/repo' });

  await assert.rejects(
    installGithubAppSecrets(config, async ({ secretName }) => ({
      exitCode: secretName === REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.installationId ? 1 : 0,
      stdout: 'wrangler output [redacted]',
      stderr: 'permission denied [redacted]',
      spawnError: 'spawn wrangler ENOENT',
    })),
    (error) => {
      assert.equal(error.code, 'repository_publication_github_app_secret_put_failed');
      assert.equal(error.secret_name, REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.installationId);
      assert.equal(error.exit_code, 1);
      assert.equal(error.stdout, 'wrangler output [redacted]');
      assert.equal(error.stderr, 'permission denied [redacted]');
      assert.equal(error.spawn_error, 'spawn wrangler ENOENT');
      assert.doesNotMatch(formatGithubAppSecretPutError(error), /12345|67890|redacted-test-key/);
      return true;
    },
  );
});

test('formatGithubAppSecretPutError renders structured command evidence', () => {
  const error = new Error('repository_publication_github_app_secret_put_failed:secret:1');
  error.code = 'repository_publication_github_app_secret_put_failed';
  error.secret_name = 'secret';
  error.exit_code = 1;
  error.stdout = 'ok [redacted]';
  error.stderr = 'failed [redacted]';
  error.spawn_error = 'spawn failed';

  const body = JSON.parse(formatGithubAppSecretPutError(error));
  assert.equal(body.ok, false);
  assert.equal(body.code, 'repository_publication_github_app_secret_put_failed');
  assert.equal(body.secret_name, 'secret');
  assert.equal(body.exit_code, 1);
  assert.equal(body.stdout, 'ok [redacted]');
  assert.equal(body.stderr, 'failed [redacted]');
  assert.equal(body.spawn_error, 'spawn failed');
});

test('formatGithubAppSecretPutText suppresses synthetic readiness follow-ons', () => {
  const output = formatGithubAppSecretPutText({
    status: 'ok',
    credential_mode: 'github_app_installation',
    config_path: 'wrangler.toml',
    installed: [{ secret_name: 'a' }, { secret_name: 'b' }, { secret_name: 'c' }],
  });

  assert.match(output, /Repository Publication GitHub App Secret Put: ok/);
  assert.doesNotMatch(output, /<worker-url>/);
  assert.doesNotMatch(output, /Repository Publication GitHub App Readiness Smoke:/);
  assert.doesNotMatch(output, /Repository Publication Provider Liveness:/);
});
