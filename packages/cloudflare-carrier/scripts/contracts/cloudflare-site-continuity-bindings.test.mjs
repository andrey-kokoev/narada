import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSiteContinuityBinding } from '@narada2/site-continuity';

import {
  admitNextSiteContinuityBinding,
  buildBindingMaterializationPlan,
  formatSiteContinuityBindingWorkflowText,
  listMaterializedSiteContinuityBindingRegistry,
  materializeSiteContinuityBindingRegistry,
  prepareNextSiteContinuityBindingPacket,
  runSiteContinuityBindingWorkflow,
  validateMaterializedSiteContinuityBindingRegistry,
} from '../workflows/cloudflare-site-continuity-bindings.mjs';

function scheduledHealthSnapshot(overrides = {}) {
  return {
    schema: 'narada.cloudflare_carrier.site_continuity_scheduled_health_snapshot.v1',
    generated_at: '2026-06-11T03:00:00.000Z',
    cloudflare_product_posture: {
      summary: {
        next_site_id: 'site_beta',
      },
    },
    cloudflare_product_binding_alignment: {
      state: 'unbound_remote_next_site',
      cloudflare_product_next_site_id: 'site_beta',
      reason: 'cloudflare_product_next_site_not_in_local_continuity_set',
    },
    ...overrides,
  };
}

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

test('site continuity binding plan captures optional text/operator context', () => {
  const plan = buildBindingMaterializationPlan({
    cwd: 'D:\\code\\narada',
    argv: [
      '--action', 'prepare-next-binding-packet',
      '--format', 'text',
      '--url', 'https://carrier.example.test',
      '--operator-session-file', 'D:\\narada\\.narada\\auth\\cloudflare-operator-session.json',
    ],
    env: {},
  });

  assert.equal(plan.format, 'text');
  assert.equal(plan.worker_url, 'https://carrier.example.test');
  assert.equal(plan.operator_session_file, 'D:\\narada\\.narada\\auth\\cloudflare-operator-session.json');
});

test('site continuity binding materializer writes registry from packet directory', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-packet-dir-'));
  const packetDirectory = path.join(tmp, 'packets');
  const registryPath = path.join(tmp, 'bindings.json');
  await writeFile(path.join(tmp, 'ignored.json'), '{}\n', 'utf8');
  await mkdir(packetDirectory, { recursive: true });
  await writeFile(path.join(packetDirectory, 'site_beta-packet.json'), `${JSON.stringify({
    binding: createSiteContinuityBinding({ site_id: 'site_beta', relation_id: 'relation-beta' }),
  }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(packetDirectory, 'site_alpha-packet.json'), `${JSON.stringify({
    binding: createSiteContinuityBinding({ site_id: 'site_alpha', relation_id: 'relation-alpha' }),
  }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(packetDirectory, 'not-a-continuity.json'), '{}\n', 'utf8');

  const plan = buildBindingMaterializationPlan({
    cwd: tmp,
    argv: ['--packet-dir', packetDirectory, '--output', registryPath, '--generated-at', '2026-06-11T01:30:00.000Z'],
    env: {},
  });
  const result = await materializeSiteContinuityBindingRegistry(plan);

  assert.deepEqual(plan.packet_directories, [packetDirectory]);
  assert.deepEqual(plan.packet_paths, [
    path.join(packetDirectory, 'site_alpha-packet.json'),
    path.join(packetDirectory, 'site_beta-packet.json'),
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.binding_count, 2);
  assert.deepEqual(result.sites, ['site_alpha', 'site_beta']);
  assert.deepEqual(result.packet_reads.map((read) => read.site_id), ['site_alpha', 'site_beta']);
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  assert.deepEqual(registry.bindings.map((binding) => binding.site_id), ['site_alpha', 'site_beta']);
});

test('site continuity binding materializer refuses missing packet directory', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-missing-packet-dir-'));

  assert.throws(
    () => buildBindingMaterializationPlan({ cwd: tmp, argv: ['--packet-dir', path.join(tmp, 'missing-packets')], env: {} }),
    /site_continuity_packet_directory_missing/,
  );
});

test('site continuity binding materializer refuses empty packet directory', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-bindings-empty-packet-dir-'));
  const packetDirectory = path.join(tmp, 'packets');
  await mkdir(packetDirectory, { recursive: true });
  await writeFile(path.join(packetDirectory, 'ignored.json'), '{}\n', 'utf8');

  assert.throws(
    () => buildBindingMaterializationPlan({ cwd: tmp, argv: ['--packet-dir', packetDirectory], env: {} }),
    /site_continuity_packet_directory_empty/,
  );
});

test('site continuity binding packet preparation refuses missing explicit refs', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-binding-prepare-missing-'));
  const healthPath = path.join(tmp, 'health.json');
  const projectionPath = path.join(tmp, '.narada', 'site-registry', 'cloudflare-sites.json');
  await mkdir(path.dirname(projectionPath), { recursive: true });
  await writeFile(healthPath, `${JSON.stringify(scheduledHealthSnapshot(), null, 2)}\n`, 'utf8');
  await writeFile(projectionPath, `${JSON.stringify({
    schema: 'narada.cloudflare_carrier.site_registry_projection.v1',
    sites: [{ site_id: 'site_beta', display_name: 'Beta Site', site_ref: null }],
  }, null, 2)}\n`, 'utf8');

  const result = await prepareNextSiteContinuityBindingPacket(buildBindingMaterializationPlan({
    cwd: tmp,
    argv: ['--action', 'prepare-next-binding-packet', '--health', healthPath],
    env: {},
  }));

  assert.equal(result.ok, false);
  assert.equal(result.action, 'refused');
  assert.equal(result.reason, 'site_continuity_binding_refs_missing');
  assert.equal(result.target_site_id, 'site_beta');
  assert.deepEqual(result.required_inputs, ['local_site_ref', 'cloudflare_site_ref']);
  assert.equal(result.embeds_credentials, false);
});

test('site continuity binding packet preparation writes packet consumable by materializer', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-binding-prepare-write-'));
  const healthPath = path.join(tmp, 'health.json');
  const packetPath = path.join(tmp, 'prepared', 'site_beta-packet.json');
  const registryPath = path.join(tmp, 'bindings.json');
  await writeFile(healthPath, `${JSON.stringify(scheduledHealthSnapshot(), null, 2)}\n`, 'utf8');

  const result = await runSiteContinuityBindingWorkflow(buildBindingMaterializationPlan({
    cwd: tmp,
    argv: [
      '--action', 'prepare-next-binding-packet',
      '--health', healthPath,
      '--local-site-ref', 'file:///D:/code/narada',
      '--cloudflare-site-ref', 'cloudflare://site-beta',
      '--packet-output', packetPath,
      '--generated-at', '2026-06-11T03:15:00.000Z',
    ],
    env: {},
  }));

  assert.equal(result.ok, true);
  assert.equal(result.action, 'written');
  assert.equal(result.reason, 'site_continuity_binding_packet_prepared');
  assert.equal(result.target_site_id, 'site_beta');
  assert.equal(result.embeds_credentials, false);
  const packet = JSON.parse(await readFile(packetPath, 'utf8'));
  assert.equal(packet.schema, 'narada.site_continuity_exchange_packet.v1');
  assert.equal(packet.site_id, 'site_beta');
  assert.equal(packet.binding.site_id, 'site_beta');
  assert.deepEqual(packet.executable_mutation_requests, []);
  assert.deepEqual(packet.binding.embodiments.map((embodiment) => embodiment.embodiment_kind).sort(), [
    'cloudflare_carrier',
    'local_windows',
  ]);

  const materializeResult = await materializeSiteContinuityBindingRegistry(buildBindingMaterializationPlan({
    cwd: tmp,
    argv: ['--packet', packetPath, '--output', registryPath, '--generated-at', '2026-06-11T03:16:00.000Z'],
    env: {},
  }));

  assert.equal(materializeResult.ok, true);
  assert.deepEqual(materializeResult.sites, ['site_beta']);
});

test('site continuity binding admission plans without execute and preserves existing bindings', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-binding-admit-plan-'));
  const healthPath = path.join(tmp, 'health.json');
  const registryPath = path.join(tmp, 'bindings.json');
  const existingBinding = createSiteContinuityBinding({
    site_id: 'site_alpha',
    local_windows_site_ref: 'file:///D:/code/narada-alpha',
    cloudflare_site_ref: 'cloudflare://site-alpha',
    generated_at: '2026-06-11T02:00:00.000Z',
  });
  await writeFile(healthPath, `${JSON.stringify(scheduledHealthSnapshot(), null, 2)}\n`, 'utf8');
  await writeFile(registryPath, `${JSON.stringify({
    schema: 'narada.site_continuity_binding_registry.v1',
    classifier_version: 'site_continuity.v1',
    registry_ref: 'operator-registry',
    generated_at: '2026-06-11T02:00:00.000Z',
    bindings: [existingBinding],
  }, null, 2)}\n`, 'utf8');

  const result = await admitNextSiteContinuityBinding(buildBindingMaterializationPlan({
    cwd: tmp,
    argv: [
      '--action', 'admit-next-binding',
      '--health', healthPath,
      '--registry', registryPath,
      '--local-site-ref', 'file:///D:/code/narada',
      '--cloudflare-site-ref', 'cloudflare://site-beta',
      '--generated-at', '2026-06-11T04:00:00.000Z',
    ],
    env: {},
  }));

  assert.equal(result.ok, true);
  assert.equal(result.action, 'planned');
  assert.equal(result.reason, 'site_continuity_binding_created');
  assert.equal(result.required_execution_flag, '--execute');
  assert.deepEqual(result.sites, ['site_alpha', 'site_beta']);
  const unchangedRegistry = JSON.parse(await readFile(registryPath, 'utf8'));
  assert.deepEqual(unchangedRegistry.bindings.map((binding) => binding.site_id), ['site_alpha']);
});

test('site continuity binding admission executes append/update into registry', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-binding-admit-execute-'));
  const healthPath = path.join(tmp, 'health.json');
  const registryPath = path.join(tmp, 'bindings.json');
  const existingBinding = createSiteContinuityBinding({
    site_id: 'site_alpha',
    local_windows_site_ref: 'file:///D:/code/narada-alpha',
    cloudflare_site_ref: 'cloudflare://site-alpha',
    generated_at: '2026-06-11T02:00:00.000Z',
  });
  await writeFile(healthPath, `${JSON.stringify(scheduledHealthSnapshot(), null, 2)}\n`, 'utf8');
  await writeFile(registryPath, `${JSON.stringify({
    schema: 'narada.site_continuity_binding_registry.v1',
    classifier_version: 'site_continuity.v1',
    registry_ref: 'operator-registry',
    generated_at: '2026-06-11T02:00:00.000Z',
    bindings: [existingBinding],
  }, null, 2)}\n`, 'utf8');

  const result = await runSiteContinuityBindingWorkflow(buildBindingMaterializationPlan({
    cwd: tmp,
    argv: [
      '--action', 'admit-next-binding',
      '--health', healthPath,
      '--registry', registryPath,
      '--local-site-ref', 'file:///D:/code/narada',
      '--cloudflare-site-ref', 'cloudflare://site-beta',
      '--generated-at', '2026-06-11T04:05:00.000Z',
      '--execute',
    ],
    env: {},
  }));

  assert.equal(result.ok, true);
  assert.equal(result.action, 'admitted');
  assert.equal(result.required_execution_flag, null);
  assert.deepEqual(result.sites, ['site_alpha', 'site_beta']);
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  assert.equal(registry.registry_ref, 'operator-registry');
  assert.deepEqual(registry.bindings.map((binding) => binding.site_id), ['site_alpha', 'site_beta']);
  const beta = registry.bindings.find((binding) => binding.site_id === 'site_beta');
  assert.equal(beta.embodiments.find((embodiment) => embodiment.embodiment_kind === 'local_windows').site_ref, 'file:///D:/code/narada');
  assert.equal(beta.embodiments.find((embodiment) => embodiment.embodiment_kind === 'cloudflare_carrier').site_ref, 'cloudflare://site-beta');
});

test('site continuity binding admission refuses smeared ref schemes', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'narada-continuity-binding-admit-invalid-'));
  const healthPath = path.join(tmp, 'health.json');
  await writeFile(healthPath, `${JSON.stringify(scheduledHealthSnapshot(), null, 2)}\n`, 'utf8');

  const result = await admitNextSiteContinuityBinding(buildBindingMaterializationPlan({
    cwd: tmp,
    argv: [
      '--action', 'admit-next-binding',
      '--health', healthPath,
      '--local-site-ref', 'D:/code/narada',
      '--cloudflare-site-ref', 'https://example.com/site-beta',
    ],
    env: {},
  }));

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'site_continuity_binding_refs_invalid');
  assert.deepEqual(result.errors, ['local_site_ref_scheme_invalid', 'cloudflare_site_ref_scheme_invalid']);
  assert.equal(result.embeds_credentials, false);
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

test('site continuity binding text format emits operator handoff for target site actions', () => {
  const text = formatSiteContinuityBindingWorkflowText({
    action: 'prepare-next-binding-packet',
    worker_url: 'https://carrier.example.test',
    operator_session_file: 'D:\\narada\\.narada\\auth\\cloudflare-operator-session.json',
    target_site_id: 'site_beta',
  }, {
    ok: true,
    action: 'written',
    reason: 'site_continuity_binding_packet_prepared',
    target_site_id: 'site_beta',
    packet_id: 'site-continuity-packet-v1-site_beta-local-windows-cloudflare',
    output_path: 'D:\\narada\\.narada\\site-continuity\\prepared\\site_beta-packet.json',
    admission_action: 'projection_only',
    admission_reason: 'site_continuity_exchange_packet_projection_admitted',
    materialize_hint: 'pnpm --filter @narada2/cloudflare-carrier continuity:bindings -- --packet D:\\narada\\.narada\\site-continuity\\prepared\\site_beta-packet.json',
  });

  assert.match(text, /Site Continuity Bindings/);
  assert.match(text, /Action: prepare-next-binding-packet/);
  assert.match(text, /Target Site: site_beta/);
  assert.match(text, /Prepared Packet: D:\\narada\\\.narada\\site-continuity\\prepared\\site_beta-packet\.json/);
  assert.match(text, /Materialize Registry: pnpm --filter @narada2\/cloudflare-carrier continuity:bindings -- --packet D:\\narada\\\.narada\\site-continuity\\prepared\\site_beta-packet\.json/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Operation List: pnpm --filter @narada2\/cloudflare-carrier product:operation:list:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_beta --operator-session-file D:\\narada\\\.narada\\auth\\cloudflare-operator-session\.json --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_beta --operator-session-file D:\\narada\\\.narada\\auth\\cloudflare-operator-session\.json/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_beta --operator-session-file D:\\narada\\\.narada\\auth\\cloudflare-operator-session\.json/);
});

test('site continuity binding text format falls back to site list when no target site exists', () => {
  const text = formatSiteContinuityBindingWorkflowText({
    action: 'materialize',
    worker_url: 'https://carrier.example.test',
    operator_session_file: 'D:\\narada\\.narada\\auth\\cloudflare-operator-session.json',
  }, {
    ok: true,
    action: 'materialized',
    binding_count: 0,
    sites: [],
  });

  assert.match(text, /Site List: pnpm --filter @narada2\/cloudflare-carrier product:site:list:text/);
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
