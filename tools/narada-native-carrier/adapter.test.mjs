import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fixtureAdapter, invokeAdapter } from './adapter.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-adapter-'));
}

test('fixture adapter emits inert proposal and invocation evidence without authority ownership', () => {
  const siteRoot = tempSite();
  const prompt = 'inspect current task';
  const result = invokeAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_adapter',
    input: {
      prompt,
      context: { task: 1291 },
      secret: 'not recorded',
    },
    now: '2026-05-15T20:32:00.000Z',
  });

  assert.equal(fs.existsSync(result.evidence_path), true);
  assert.equal(result.evidence.adapter_boundary.model_adapter_authority_owner, 'none');
  assert.equal(result.evidence.adapter_boundary.executor_adapter_authority_owner, 'none');
  assert.equal(result.evidence.adapter_boundary.output_is_inert_until_admitted, true);
  assert.equal(result.evidence.input_summary.raw_secret_values_recorded, false);
  assert.equal(result.evidence.input_summary.unbounded_transcript_recorded, false);
  assert.equal(result.evidence.output.raw_output_recorded, false);
  assert.equal(result.evidence.output.text_output_summary.present, true);
  assert.equal('text_output' in result.evidence.output, false);
  assert.equal(result.evidence.output.proposed_action_packet.status, 'inert_proposal');
  assert.deepEqual(result.evidence.output.proposed_action_packet.payload_summary, {
    shape: 'object',
    keys: ['summary'],
    values_omitted: true,
  });
  assert.equal(result.evidence.output.proposed_action_packet.requires_canonical_admission, true);
  assert.doesNotMatch(fs.readFileSync(result.evidence_path, 'utf8'), new RegExp(prompt));
});

test('fixture adapter refuses missing prompt without fabricating an action', () => {
  const output = fixtureAdapter({ context: {} });

  assert.equal(output.status, 'refused');
  assert.equal(output.proposed_action_packet, null);
  assert.equal(output.refusal_output.reason, 'missing_prompt');
});

test('adapter invocation evidence redacts raw adapter output and prompt-like secrets', () => {
  const siteRoot = tempSite();
  const prompt = 'deploy with password=hunter2 and token sk-testsecretvalue123456';
  const result = invokeAdapter({
    siteRoot,
    carrierSessionId: 'carrier_session_redaction',
    input: {
      prompt,
      context: { task: 1291 },
    },
    adapter: () => ({
      schema: 'narada.narada_native_carrier.adapter_output.v0',
      adapter_id: 'unsafe_fixture',
      status: 'proposed',
      text_output: `raw:${prompt}`,
      refusal_output: null,
      proposed_action_packet: {
        status: 'inert_proposal',
        action_type: 'observation',
        payload: {
          transcript: prompt,
          token: 'sk-testsecretvalue123456',
        },
        requires_canonical_admission: true,
      },
      closeout_summary: 'unsafe_fixture_completed_without_effect_authority',
    }),
    now: '2026-05-15T20:32:00.000Z',
  });
  const evidenceText = fs.readFileSync(result.evidence_path, 'utf8');

  assert.equal(result.evidence.output.raw_output_recorded, false);
  assert.equal(result.evidence.output.raw_secret_values_recorded, false);
  assert.equal(result.evidence.output.unbounded_transcript_recorded, false);
  assert.equal('text_output' in result.evidence.output, false);
  assert.equal('payload' in result.evidence.output.proposed_action_packet, false);
  assert.deepEqual(result.evidence.output.proposed_action_packet.payload_summary.keys, ['token', 'transcript']);
  assert.doesNotMatch(evidenceText, /hunter2/);
  assert.doesNotMatch(evidenceText, /sk-testsecretvalue123456/);
  assert.doesNotMatch(evidenceText, /deploy with password/);
});
