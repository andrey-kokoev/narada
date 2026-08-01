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
  const hostFleetTransport = read('host-fleet/transport.ts');
  const hostFleetWorkflows = read('host-fleet/workflows.ts');
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
  assert.match(mutationPage, /useSiteRegistryWorkflow/);
  assert.match(siteAgentsPage, /\.site-actions-trigger\s*\{[^}]*opacity:\s*\.72;[^}]*pointer-events:\s*auto;/s);
  assert.match(siteAgentsPage, /\.agent-actions-trigger\s*\{[^}]*opacity:\s*\.72;[^}]*pointer-events:\s*auto;/s);
  assert.doesNotMatch(siteAgentsPage, /\.site-actions-trigger\s*\{[^}]*opacity:\s*0;/s);
  assert.doesNotMatch(siteAgentsPage, /\.agent-actions-trigger\s*\{[^}]*opacity:\s*0;/s);
  assert.match(hostFleetPage, /fleet\.attach\(session\)/);
  assert.match(hostFleetPage, /fleet\.preflightLifecycle/);
  assert.match(hostFleetPage, /fleet\.applyLifecycleIntent/);
  assert.match(hostFleetPage, /fleet\.applyEnrollment/);
  assert.match(hostFleetPage, /projection-only/);
  assert.doesNotMatch(hostFleetPage, /fetch\s*\(/);
  assert.doesNotMatch(hostFleetPage, /gatewaySecret|rawCredential|password\s*:/i);
  assert.match(hostFleetWorkflows, /credentialRef/);
  assert.match(hostFleetWorkflows, /dedicated_host_gateway/);
  assert.doesNotMatch(hostFleetWorkflows, /credentialValue|credentialSecret|rawCredential/i);
  assert.match(hostFleetTransport, /cloudflare-projection/);
  assert.match(hostFleetTransport, /host_fleet_authority_local_only/);
  assert.match(hostFleetTransport, /gateway_health\.v1/);
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
