import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');

async function importSource(relativePath) {
  return import(pathToFileURL(resolve(__dirname, relativePath)).href);
}

test('clean-install migration produces a catalog accepted by launcher preflight', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-clean-install-preflight-'));
  const priorUserSiteRoot = process.env.NARADA_USER_SITE_ROOT;
  try {
    const dbPath = join(root, '.ai', 'intelligence-registry.db');
    await assert.rejects(access(dbPath));
    process.env.NARADA_USER_SITE_ROOT = root;

    const management = await importSource('../../../../invokable-intelligence-management/src/bootstrap.ts');
    const sourceRegistryPath = resolve(naradaProperRoot, 'packages', 'invokable-intelligence-management', 'assets', 'provider-registry.bootstrap.json');
    const bootstrap = await management.ensureIntelligenceCatalog({
      siteRoot: root,
      targetSiteId: 'site:clean-install-user',
      userSiteId: 'site:clean-install-user',
      hostSiteId: 'site:clean-install-host',
      sourceRegistryPath,
    });
    assert.equal(bootstrap.status, 'initialized');
    assert.equal(bootstrap.mutation_performed, true);
    assert.ok(bootstrap.catalog_record_count > 0);

    const launcherRuntime = await importSource('../../src/lib/launcher-runtime.ts');
    const preflight = launcherRuntime.runAgentStartCommand({
      siteRoot: root,
      workspaceRoot: root,
      targetSiteId: 'site:clean-install-user',
      agent: 'resident',
      carrier: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      preflightOnly: true,
      launchSource: 'clean-install migration plus launcher preflight e2e',
      dependencyWorkspaceRoot: naradaProperRoot,
    });
    assert.equal(preflight.status, 'success');
    assert.equal(preflight.parsed_result?.schema, 'narada.agent_start.intelligence_catalog_preflight.v1');
    assert.equal(preflight.parsed_result?.status, 'ready');
    assert.ok(preflight.parsed_result.catalog_record_count > 0);
  } finally {
    if (priorUserSiteRoot === undefined) delete process.env.NARADA_USER_SITE_ROOT;
    else process.env.NARADA_USER_SITE_ROOT = priorUserSiteRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test('missing catalog preflight emits an explicit recovery action', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-missing-catalog-preflight-'));
  const priorUserSiteRoot = process.env.NARADA_USER_SITE_ROOT;
  try {
    process.env.NARADA_USER_SITE_ROOT = root;
    const launcherRuntime = await importSource('../../src/lib/launcher-runtime.ts');
    const preflight = launcherRuntime.runAgentStartCommand({
      siteRoot: root,
      workspaceRoot: root,
      targetSiteId: 'site:missing-catalog-user',
      agent: 'resident',
      carrier: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      preflightOnly: true,
      launchSource: 'missing catalog recovery e2e',
      dependencyWorkspaceRoot: naradaProperRoot,
    });
    assert.equal(preflight.status, 'failed');
    assert.equal(preflight.parsed_result?.reason_code, 'intelligence_catalog_missing');
    assert.equal(preflight.parsed_result?.recovery?.kind, 'user_site_intelligence_catalog_bootstrap');
    assert.equal(preflight.parsed_result?.recovery?.primary_command, 'narada onboarding start --platform windows --scope user-site');
  } finally {
    if (priorUserSiteRoot === undefined) delete process.env.NARADA_USER_SITE_ROOT;
    else process.env.NARADA_USER_SITE_ROOT = priorUserSiteRoot;
    await rm(root, { recursive: true, force: true });
  }
});
