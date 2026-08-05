import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CredentialLocatorResolutionError,
  resolveCredentialLocator,
} from './credential-locator.js';

test('resolves an exact site-secret reference through the governed PowerShell lookup', async () => {
  let command: string | undefined;
  let args: string[] | undefined;
  let commandOptions: Record<string, any> | undefined;
  const value = await resolveCredentialLocator(
    { id: 'credential-locator:operator-console-bridge', store: 'site-secret', reference: 'narada/operator-console/bridge-token' },
    {
      env: { NARADA_TEST_SENTINEL: 'present' },
      runCommandSync: (receivedCommand: string, receivedArgs: string[], receivedOptions: Record<string, any>) => {
        command = receivedCommand;
        args = receivedArgs;
        commandOptions = receivedOptions;
        return { status: 0, stdout: 'resolved-secret\n', stderr: '' };
      },
    },
  );

  assert.equal(value, 'resolved-secret');
  assert.equal(command, 'pwsh');
  assert.deepEqual(args?.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.equal(commandOptions?.env.NARADA_SECRET_LOOKUP_NAME, 'narada/operator-console/bridge-token');
  assert.equal(commandOptions?.env.NARADA_TEST_SENTINEL, 'present');
});

test('refuses a missing site-secret without exposing the lookup output', async () => {
  await assert.rejects(
    resolveCredentialLocator(
      { id: 'credential-locator:missing', store: 'site-secret', reference: 'narada/operator-console/missing' },
      { runCommandSync: () => ({ status: 2, stdout: 'not-a-secret-to-propagate', stderr: '' }) },
    ),
    (error: unknown) => error instanceof CredentialLocatorResolutionError
      && error.code === 'credential-unavailable'
      && error.locatorId === 'credential-locator:missing',
  );
});
