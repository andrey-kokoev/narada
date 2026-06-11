import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSiteContinuityBinding } from '@narada2/site-continuity';

import {
  buildBindingMaterializationPlan,
  listMaterializedSiteContinuityBindingRegistry,
  materializeSiteContinuityBindingRegistry,
  runSiteContinuityBindingWorkflow,
  validateMaterializedSiteContinuityBindingRegistry,
} from './cloudflare-site-continuity-bindings.mjs';

test('site continuity binding materializer writes registry from packet binding', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-'));
  const packetPath = path.join(tmp, 'packet.json');
  const registryPath = path.join(tmp, 'bindings.json');
  const binding = createSiteContinuityBinding({
    site_id: 'site_bound',
    local_windows_site_ref: 'file:///D:/code/narada',
    cloudflare_site_ref: 'cloudflare://narada-cloudflare-carrier',
    authority_map_ref: 'narada:site-authority-map:site_bound',
    generated_at: '2026-06-11T00:00:00.000Z',
  });
  await writeFile(packetPath, `${JSON.stringify({ binding }, null, 2)}\n`, 'utf8');

  const plan = buildBindingMaterializationPlan({
    cwd: tmp,
    argv: ['--packet', packetPath, '--output', registryPath, '--generated-at', '2026-06-11T01:00:00.000Z'],
    env: {},
  });
  const result = await materializeSiteContinuityBindingRegistry(plan);

  assert.equal(result.ok, true);
  assert.equal(result.action, 'materialized');
  assert.deepEqual(result.sites, ['site_bound']);
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  assert.equal(registry.schema, 'narada.site_continuity_binding_registry.v1');
  assert.equal(registry.bindings.length, 1);
  assert.equal(registry.bindings[0].site_id, 'site_bound');
});

test('site continuity binding materializer refuses invalid packet binding', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-invalid-'));
  const packetPath = path.join(tmp, 'packet.json');
  await writeFile(packetPath, `${JSON.stringify({ binding: { site_id: 'site_bad' } }, null, 2)}\n`, 'utf8');

  const plan = buildBindingMaterializationPlan({ cwd: tmp, argv: ['--packet', packetPath], env: {} });
  await assert.rejects(
    () => materializeSiteContinuityBindingRegistry(plan),
    /site_continuity_packet_binding_invalid/,
  );
});

test('site continuity binding materializer refuses duplicate site bindings', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-duplicate-site-'));
  const firstPacketPath = path.join(tmp, 'packet-1.json');
  const secondPacketPath = path.join(tmp, 'packet-2.json');
  await writeFile(firstPacketPath, `${JSON.stringify({
    binding: createSiteContinuityBinding({ site_id: 'site_bound', relation_id: 'relation-1' }),
  }, null, 2)}\n`, 'utf8');
  await writeFile(secondPacketPath, `${JSON.stringify({
    binding: createSiteContinuityBinding({ site_id: 'site_bound', relation_id: 'relation-2' }),
  }, null, 2)}\n`, 'utf8');

  const plan = buildBindingMaterializationPlan({
    cwd: tmp,
    argv: ['--packet', firstPacketPath, '--packet', secondPacketPath],
    env: {},
  });
  await assert.rejects(
    () => materializeSiteContinuityBindingRegistry(plan),
    /site_continuity_binding_registry_invalid:site_continuity_binding_registry_site_duplicate:site_bound/,
  );
});

test('site continuity binding workflow validates materialized registry', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-validate-'));
  const registryPath = path.join(tmp, 'bindings.json');
  const binding = createSiteContinuityBinding({ site_id: 'site_bound' });
  await writeFile(registryPath, `${JSON.stringify({
    schema: 'narada.site_continuity_binding_registry.v1',
    classifier_version: 'site_continuity.v1',
    registry_ref: 'operator-registry',
    generated_at: '2026-06-11T02:00:00.000Z',
    bindings: [binding],
  }, null, 2)}\n`, 'utf8');

  const plan = buildBindingMaterializationPlan({
    cwd: tmp,
    argv: ['--action', 'validate', '--registry', registryPath],
    env: {},
  });
  const result = await validateMaterializedSiteContinuityBindingRegistry(plan);

  assert.equal(result.ok, true);
  assert.equal(result.action, 'validated');
  assert.equal(result.registry_ref, 'operator-registry');
  assert.equal(result.binding_count, 1);
  assert.deepEqual(result.sites, ['site_bound']);
});

test('site continuity binding workflow lists operator-readable binding details', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-list-'));
  const registryPath = path.join(tmp, 'bindings.json');
  const binding = createSiteContinuityBinding({
    site_id: 'site_bound',
    local_windows_site_ref: 'file:///D:/code/narada',
    cloudflare_site_ref: 'cloudflare://narada-cloudflare-carrier',
  });
  await writeFile(registryPath, `${JSON.stringify({
    schema: 'narada.site_continuity_binding_registry.v1',
    classifier_version: 'site_continuity.v1',
    registry_ref: 'operator-registry',
    generated_at: '2026-06-11T02:00:00.000Z',
    bindings: [binding],
  }, null, 2)}\n`, 'utf8');

  const result = await runSiteContinuityBindingWorkflow(buildBindingMaterializationPlan({
    cwd: tmp,
    argv: ['--action', 'list', '--registry', registryPath],
    env: {},
  }));

  assert.equal(result.ok, true);
  assert.equal(result.action, 'listed');
  assert.equal(result.binding_count, 1);
  assert.equal(result.sites[0].site_id, 'site_bound');
  assert.deepEqual(result.sites[0].embodiments.map((embodiment) => embodiment.embodiment_kind), [
    'cloudflare_carrier',
    'local_windows',
  ]);
});

test('site continuity binding workflow refuses invalid materialized registry', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-invalid-registry-'));
  const registryPath = path.join(tmp, 'bindings.json');
  await writeFile(registryPath, `${JSON.stringify({ schema: 'wrong' }, null, 2)}\n`, 'utf8');

  const plan = buildBindingMaterializationPlan({
    cwd: tmp,
    argv: ['--action', 'list', '--registry', registryPath],
    env: {},
  });
  await assert.rejects(
    () => listMaterializedSiteContinuityBindingRegistry(plan),
    /site_continuity_binding_registry_invalid:site_continuity_binding_registry_schema_mismatch/,
  );
});
