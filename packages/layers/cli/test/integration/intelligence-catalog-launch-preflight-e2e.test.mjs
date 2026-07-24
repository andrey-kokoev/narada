import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');

async function importSource(relativePath) {
  return import(pathToFileURL(resolve(__dirname, relativePath)).href);
}

async function writeLaunchContext(root, { userSiteId, hostSiteId, principalId }) {
  const naradaRoot = join(root, '.narada');
  await mkdir(naradaRoot, { recursive: true });
  await writeFile(join(naradaRoot, 'intelligence-launch-context.json'), JSON.stringify({
    schema: 'narada.intelligence.launch_context.v1',
    user_site_id: userSiteId,
    host_site_id: hostSiteId,
    principal_id: principalId,
  }), 'utf8');
}

test('clean-install migration does not fabricate principal admission; launcher preflight refuses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-clean-install-preflight-'));
  const priorUserSiteRoot = process.env.NARADA_USER_SITE_ROOT;
  try {
    const dbPath = join(root, '.ai', 'intelligence-registry.db');
    await assert.rejects(access(dbPath));
    process.env.NARADA_USER_SITE_ROOT = root;
    await writeLaunchContext(root, {
      userSiteId: 'site:clean-install-user',
      hostSiteId: 'site:clean-install-host',
      principalId: 'principal:clean-install-user',
    });

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
    assert.equal(preflight.status, 'failed');
    assert.equal(preflight.parsed_result?.schema, 'narada.agent_start.intelligence_catalog_preflight.v1');
    assert.equal(preflight.parsed_result?.status, 'blocked');
    assert.equal(preflight.parsed_result?.reason_code, 'intelligence_local_readiness_blocked');
    assert.equal(preflight.parsed_result?.readiness?.checks.find(({ id }) => id === 'principal-admission')?.code, 'principal-not-admitted');
    assert.ok(preflight.parsed_result.catalog_record_count > 0);

    const repeatBootstrap = await management.ensureIntelligenceCatalog({
      siteRoot: root,
      targetSiteId: 'site:clean-install-user',
      userSiteId: 'site:clean-install-user',
      hostSiteId: 'site:clean-install-host',
      sourceRegistryPath,
    });
    assert.equal(repeatBootstrap.status, 'already_ready');
    assert.equal(repeatBootstrap.mutation_performed, false);
    assert.equal(repeatBootstrap.catalog_record_count, bootstrap.catalog_record_count);

    const repeatPreflight = launcherRuntime.runAgentStartCommand({
      siteRoot: root,
      workspaceRoot: root,
      targetSiteId: 'site:clean-install-user',
      agent: 'resident',
      carrier: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      preflightOnly: true,
      launchSource: 'repeat clean-install migration plus launcher preflight e2e',
      dependencyWorkspaceRoot: naradaProperRoot,
    });
    assert.equal(repeatPreflight.status, 'failed');
    assert.equal(repeatPreflight.parsed_result?.status, 'blocked');
    assert.equal(repeatPreflight.parsed_result?.reason_code, 'intelligence_local_readiness_blocked');
  } finally {
    if (priorUserSiteRoot === undefined) delete process.env.NARADA_USER_SITE_ROOT;
    else process.env.NARADA_USER_SITE_ROOT = priorUserSiteRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test('catalog source drift remains non-mutating and readiness-blocked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-catalog-source-drift-preflight-'));
  const sourceRoot = join(root, 'sources');
  const firstSource = join(sourceRoot, 'legacy-provider-registry.json');
  const secondSource = join(sourceRoot, 'provider-registry.bootstrap.json');
  const priorUserSiteRoot = process.env.NARADA_USER_SITE_ROOT;
  try {
    const sourceRegistryPath = resolve(naradaProperRoot, 'packages', 'invokable-intelligence-management', 'assets', 'provider-registry.bootstrap.json');
    const source = JSON.parse(await readFile(sourceRegistryPath, 'utf8'));
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(firstSource, JSON.stringify({
      ...source,
      description: 'Frozen legacy provider-registry migration fixture; never runtime or selection authority.',
    }));
    await writeFile(secondSource, JSON.stringify({
      ...source,
      description: 'Non-secret bootstrap input for first-time User Site catalog migration; never runtime or selection authority.',
    }));
    process.env.NARADA_USER_SITE_ROOT = root;
    await writeLaunchContext(root, {
      userSiteId: 'site:catalog-source-drift',
      hostSiteId: 'site:catalog-source-drift-host',
      principalId: 'principal:catalog-source-drift',
    });

    const management = await importSource('../../../../invokable-intelligence-management/src/bootstrap.ts');
    const first = await management.ensureIntelligenceCatalog({
      siteRoot: root,
      targetSiteId: 'site:catalog-source-drift',
      userSiteId: 'site:catalog-source-drift',
      hostSiteId: 'site:catalog-source-drift-host',
      sourceRegistryPath: firstSource,
      plannedAt: '2026-07-19T00:00:00Z',
    });
    assert.equal(first.status, 'initialized');

    const second = await management.ensureIntelligenceCatalog({
      siteRoot: root,
      targetSiteId: 'site:catalog-source-drift',
      userSiteId: 'site:catalog-source-drift',
      hostSiteId: 'site:catalog-source-drift-host',
      sourceRegistryPath: secondSource,
      plannedAt: '2026-07-20T00:00:00Z',
    });
    assert.equal(second.status, 'already_ready');
    assert.equal(second.mutation_performed, false);
    assert.equal(second.counts.add, 0);
    assert.equal(second.counts.update, 0);
    assert.equal(second.catalog_record_count, first.catalog_record_count);

    const launcherRuntime = await importSource('../../src/lib/launcher-runtime.ts');
    const preflight = launcherRuntime.runAgentStartCommand({
      siteRoot: root,
      workspaceRoot: root,
      targetSiteId: 'site:catalog-source-drift',
      agent: 'resident',
      carrier: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      preflightOnly: true,
      launchSource: 'catalog source drift plus launcher preflight e2e',
      dependencyWorkspaceRoot: naradaProperRoot,
    });
    assert.equal(preflight.status, 'failed');
    assert.equal(preflight.parsed_result?.status, 'blocked');
    assert.equal(preflight.parsed_result?.reason_code, 'intelligence_local_readiness_blocked');
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
    await writeLaunchContext(root, {
      userSiteId: 'site:missing-catalog-user',
      hostSiteId: 'site:missing-catalog-host',
      principalId: 'principal:missing-catalog-user',
    });
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
