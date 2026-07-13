import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function read(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

test('Operator Console pages stay behind the route and workflow boundaries', () => {
  const app = read('App.vue');
  const registryPage = read('pages/SiteRegistryPage.vue');
  const mutationPage = read('pages/SiteRegistryMutationPage.vue');
  const launchPage = read('pages/OperatorConsoleLaunchPage.vue');
  const launchDomain = read('launcher/session-domain.ts');
  const launchTransport = read('launcher/session-transport.ts');
  const launchComposable = read('launcher/composables/useOperatorConsoleLauncherSessions.ts');
  const routes = read('console/routes.ts');

  assert.match(app, /resolveOperatorConsoleRoute/);
  assert.match(routes, /kind: 'launcher'/);
  assert.doesNotMatch(registryPage, /fetch\s*\(/);
  assert.doesNotMatch(mutationPage, /fetch\s*\(/);
  assert.doesNotMatch(launchPage, /fetch\s*\(/);
  assert.match(launchPage, /useOperatorConsoleLauncherSessions/);
  assert.match(launchDomain, /parseWorkspaceLaunchUiSessionList/);
  assert.match(launchTransport, /parseOperatorConsoleLauncherSessions/);
  assert.match(launchComposable, /createOperatorConsoleLauncherSessionTransport/);
  assert.match(mutationPage, /useSiteRegistryWorkflow/);
});
