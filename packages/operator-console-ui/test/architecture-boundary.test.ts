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
  const registryComposable = read('site-registry/composables/useSiteRegistry.ts');
  const registryAdapter = read('site-registry/adapter.ts');
  const registryTransport = read('site-registry/transport.ts');
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
  assert.doesNotMatch(registryComposable, /fetch\s*\(/);
  assert.doesNotMatch(registryComposable, /parseSiteRegistry/);
  assert.match(registryTransport, /createSiteRegistryTransport/);
  assert.match(registryTransport, /fetchLike/);
  assert.match(registryAdapter, /parseSiteRegistryListResponse/);
  assert.match(registryAdapter, /createSiteRegistryAdapter/);
  assert.match(launchPage, /useSiteRegistry/);
  assert.match(launchDomain, /parseWorkspaceLaunchUiSessionList/);
  assert.match(launchTransport, /parseOperatorConsoleLauncherSessions/);
  assert.match(launchComposable, /createOperatorConsoleLauncherSessionTransport/);
  assert.match(mutationPage, /useSiteRegistryWorkflow/);
});

test('route discovery never gates canonical registry mutation admission', () => {
  const mutationPage = read('pages/SiteRegistryMutationPage.vue');

  assert.match(mutationPage, /routeDirectoryUnavailable/);
  assert.match(mutationPage, /@submit\.prevent="preview"/);
  assert.match(mutationPage, /@click="apply"/);
  assert.match(mutationPage, /:disabled="!canPlan"/);
  assert.match(mutationPage, /:disabled="!canApply \|\| busy"/);
  assert.doesNotMatch(mutationPage, /routeAuthorityAvailable|previewWithRouteAuthority|applyWithRouteAuthority/);
});
