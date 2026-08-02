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
  const siteAgentsPage = read('pages/SiteAgentsPage.vue');
  const sessionsPage = read('pages/AgentSessionsPage.vue');
  const hostFleetPage = read('pages/HostFleetPage.vue');
  const hostFleetAdapter = read('host-fleet/adapter.ts');
  const routes = read('console/routes.ts');

  assert.match(app, /resolveOperatorConsoleRoute/);
  assert.match(routes, /kind: 'launcher'/);
  assert.doesNotMatch(registryPage, /fetch\s*\(/);
  assert.doesNotMatch(mutationPage, /fetch\s*\(/);
  assert.doesNotMatch(launchPage, /fetch\s*\(/);
  assert.doesNotMatch(hostFleetPage, /fetch\s*\(/);
  assert.doesNotMatch(hostFleetPage, /site_id|agent_id|session_id|runtime_session_id/);
  assert.doesNotMatch(hostFleetPage, /enroll|revoke|retire|launch|stop|delete/i);
  assert.match(hostFleetPage, /operator_console\.status === 'available' && host\.operator_console\.url/);
  assert.match(hostFleetAdapter, /validateHostFleetReadResponse/);
  assert.doesNotMatch(registryComposable, /fetch\s*\(/);
  assert.doesNotMatch(registryComposable, /parseSiteRegistry/);
  assert.match(registryTransport, /createSiteRegistryTransport/);
  assert.match(registryTransport, /fetchLike/);
  assert.match(registryAdapter, /parseSiteRegistryListResponse/);
  assert.match(registryAdapter, /createSiteRegistryAdapter/);
  assert.match(launchPage, /useSiteRegistry/);
  assert.match(mutationPage, /useSiteRegistryWorkflow/);
  assert.match(siteAgentsPage, /\.site-actions-trigger\s*\{[^}]*opacity:\s*\.72;[^}]*pointer-events:\s*auto;/s);
  assert.match(siteAgentsPage, /\.agent-actions-trigger\s*\{[^}]*opacity:\s*\.72;[^}]*pointer-events:\s*auto;/s);
  assert.doesNotMatch(siteAgentsPage, /\.site-actions-trigger\s*\{[^}]*opacity:\s*0;/s);
  assert.doesNotMatch(siteAgentsPage, /\.agent-actions-trigger\s*\{[^}]*opacity:\s*0;/s);
  const invalidScopeEmptyState = sessionsPage.indexOf('No session attachment is permitted for an invalid scope.');
  const genericEmptyState = sessionsPage.indexOf('No NARS sessions are currently discoverable.');
  assert.ok(invalidScopeEmptyState >= 0 && genericEmptyState >= 0 && invalidScopeEmptyState < genericEmptyState);
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
