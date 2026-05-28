import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { materializeAndClose } from './harness.mjs';
import { startSupervisedSession } from './supervisor.mjs';
import { TO_DATA_READ_FAMILIES } from './to-data-packet.mjs';
import { buildIntegratedToDataBundle, TO_DATA_BUNDLE_SCHEMA } from './to-data-bundle.mjs';
import { NO_MUTATION_FLAGS } from './to-data-readers.mjs';
import { runFixtureWorkLoop } from './work-loop.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-to-data-bundle-'));
}

test('integrated to-data bundle composes all read families as bounded non-mutating packets', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'session-integrated-bundle';
  const now = '2026-05-16T01:45:00.000Z';
  fs.writeFileSync(path.join(siteRoot, 'readme.txt'), 'bounded excerpt line one\nline two\n', 'utf8');
  materializeAndClose({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    agentStartEventId: 'agent-start-integrated',
    now,
  });
  runFixtureWorkLoop({
    siteRoot,
    carrierSessionId,
    startupContext: { agent_id: 'narada.builder' },
    workPacket: { task_number: 1326, prompt: 'do not leak token sk-integrated-secret' },
    now,
  });
  startSupervisedSession({ siteRoot, carrierSessionId, agentId: 'narada.builder', now });

  const bundle = await buildIntegratedToDataBundle({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    taskNumber: 1326,
    excerptFilePath: 'readme.txt',
    fileExcerptCapabilityRef: { kind: 'site_file_excerpt_read', ref: 'cap:file-excerpt' },
    readTaskCommand: async () => JSON.stringify({
      task: {
        task_number: 1326,
        task_id: '20260516-1326-add-integrated-to-data-adapter-reconstruction-proof',
        title: 'Add integrated to-data adapter reconstruction proof',
        status: 'claimed',
        goal: 'Prove the to-data adapters compose into a bounded Narada-native data bundle.',
      },
    }),
    readWorkNextCommand: null,
    readInboxCommand: async () => JSON.stringify({
      envelopes: [{
        envelope_id: 'env-integrated',
        status: 'received',
        source_ref: 'test:integrated',
        kind: 'observation',
        target_locus: 'narada-proper',
        payload: {
          summary: 'safe payload text is omitted',
          secret_token: 'sk-inbox-secret',
        },
      }],
    }),
    now,
  });

  assert.equal(bundle.schema, TO_DATA_BUNDLE_SCHEMA);
  assert.deepEqual(bundle.read_families, TO_DATA_READ_FAMILIES);
  assert.equal(bundle.validation.status, 'passed');
  assert.equal(bundle.direct_sqlite_requirement_recorded, false);
  assert.equal(bundle.raw_provider_output_recorded, false);
  assert.equal(bundle.unbounded_transcript_recorded, false);
  assert.equal(bundle.authority_mutation_performed, false);
  assert.deepEqual(bundle.no_mutation_flags_required, NO_MUTATION_FLAGS);
  assert.ok(bundle.residuals.includes('capability_consent_binding_not_materialized_in_this_proof'));
  assert.ok(bundle.residuals.includes('orchestration_wrapper_chapter_still_required'));

  for (const packet of bundle.packets) {
    assert.equal(packet.carrier_session_id, carrierSessionId);
    assert.equal(packet.agent_id, 'narada.builder');
    assert.ok(packet.attribution.command);
    assert.ok(packet.capability_ref.ref);
    assert.equal(packet.freshness.posture, 'bounded_snapshot');
    assert.deepEqual(packet.mutation_flags, NO_MUTATION_FLAGS);
    assert.equal(packet.authority_mutation_performed, false);
  }
  assert.equal(bundle.packets.find((packet) => packet.read_family === 'work_next_peek').read_status, 'refused');
  assert.equal(bundle.packets.find((packet) => packet.read_family === 'bounded_file_excerpt').bounded_summary.excerpt_present, true);
  const serialized = JSON.stringify(bundle);
  assert.equal(serialized.includes('sk-integrated-secret'), false);
  assert.equal(serialized.includes('sk-inbox-secret'), false);
  assert.equal(serialized.includes('safe payload text is omitted'), false);
});
