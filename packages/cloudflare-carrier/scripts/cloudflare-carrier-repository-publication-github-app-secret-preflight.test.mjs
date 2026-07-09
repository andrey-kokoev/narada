import assert from 'node:assert/strict';
import { execFileGoverned } from '@narada2/process-launch-posture';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = join(packageRoot, 'scripts', 'cloudflare-carrier-repository-publication-github-app-secret-preflight.mjs');
const privateKey = '-----BEGIN PRIVATE KEY-----\\nredacted-test-key\\n-----END PRIVATE KEY-----';

test('github app secret preflight accepts complete redacted source values', async () => {
  const { stdout } = await execFileGoverned(
    process.execPath,
    [scriptPath, '--app-id', '12345', '--installation-id', '67890', '--private-key', privateKey],
    { cwd: packageRoot, timeout: 30000, windowsHide: true },
  );
  const body = JSON.parse(stdout);

  assert.equal(body.schema, 'narada.cloudflare_carrier.repository_publication_github_app_secret_preflight.v1');
  assert.equal(body.status, 'ready');
  assert.equal(body.credential_mode, 'github_app_installation');
  assert.deepEqual(body.missing, []);
  assert.deepEqual(body.errors, []);
  assert.equal(body.checks.every((check) => check.present), true);
  assert.doesNotMatch(stdout, /12345|67890|redacted-test-key/);
});

test('github app secret preflight reports invalid source shape without leaking values', async () => {
  await assert.rejects(
    execFileGoverned(
      process.execPath,
      [scriptPath, '--app-id', 'app-id', '--installation-id', 'installation-id', '--private-key', 'not-a-pem'],
      { cwd: packageRoot, timeout: 30000, windowsHide: true },
    ),
    (error) => {
      const body = JSON.parse(error.stdout);
      assert.equal(body.status, 'not_ready');
      assert.deepEqual(body.missing, []);
      assert.deepEqual(body.errors, [
        'github_app_id_must_be_numeric',
        'github_app_installation_id_must_be_numeric',
        'github_app_private_key_must_be_pkcs8_pem_begin',
        'github_app_private_key_must_be_pkcs8_pem_end',
      ]);
      assert.doesNotMatch(error.stdout, /app-id|installation-id|not-a-pem/);
      return true;
    },
  );
});
