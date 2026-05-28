import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateCarrierActionPacket } from './carrier-action-packet.mjs';
import { emitCommandIntentHandoffPacket } from './command-intent-handoff-family.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-command-intent-'));
}

test('command intent handoff emits CEIZ-style inert draft packet', () => {
  const siteRoot = tempSite();
  const result = emitCommandIntentHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_command_packet',
    agentId: 'narada.builder',
    argv: ['node', '--test', 'tools/narada-native-carrier/command-intent-handoff-family.test.mjs'],
    cwd: siteRoot,
    envPolicy: { mode: 'allowlist', allowed_keys: ['NODE_ENV', 'SECRET_TOKEN'] },
    sideEffectClass: 'test',
    timeoutMs: 120000,
    outputAdmissionProfile: 'bounded_tap_summary',
    rationale: 'Verify command intent handoff.',
    now: '2026-05-16T03:42:00.000Z',
  });
  const payload = JSON.parse(fs.readFileSync(result.payload_ref, 'utf8'));

  assert.equal(result.packet.action_family, 'command_intent');
  assert.deepEqual(validateCarrierActionPacket(result.packet), []);
  assert.deepEqual(payload.argv.slice(0, 2), ['node', '--test']);
  assert.equal(payload.env_policy.mode, 'allowlist');
  assert.deepEqual(payload.env_policy.allowed_keys, ['NODE_ENV']);
  assert.equal(payload.side_effect_class, 'test');
  assert.equal(payload.timeout_ms, 120000);
  assert.equal(payload.output_admission_profile, 'bounded_tap_summary');
  assert.match(payload.suggested_command_intent_surface, /narada command intent submit/);
});

test('command intent handoff does not spawn process or invoke shell', () => {
  const siteRoot = tempSite();
  const result = emitCommandIntentHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_no_spawn',
    agentId: 'narada.builder',
    argv: ['git', 'status'],
  });

  assert.equal(result.process_spawned, false);
  assert.equal(result.shell_invoked, false);
  assert.equal(result.direct_mutation_performed, false);
  assert.equal(result.payload.process_spawned, false);
  assert.equal(result.payload.shell_invoked, false);
  assert.equal(result.packet.direct_mutation_performed, false);
  assert.equal(result.packet.requires_canonical_admission, true);
});

test('command intent handoff omits shell strings and env secrets', () => {
  const siteRoot = tempSite();
  const result = emitCommandIntentHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_command_redaction',
    agentId: 'narada.builder',
    argv: ['powershell', '-Command', 'echo secret; Remove-Item C:\\temp', 'sk-commandsecret123456'],
    cwd: 'C:\\work',
    envPolicy: {
      mode: 'allowlist',
      allowed_keys: ['PATH', 'OPENAI_API_KEY', 'PASSWORD'],
      values: { OPENAI_API_KEY: 'sk-commandsecret123456' },
    },
    rationale: 'run secret sk-commandsecret123456',
  });
  const text = fs.readFileSync(result.payload_ref, 'utf8') + JSON.stringify(result.packet);

  assert.deepEqual(result.payload.argv, ['powershell', '-Command']);
  assert.ok(result.payload.argv_omissions.includes('unsafe_or_secret_like_arg'));
  assert.deepEqual(result.payload.env_policy.allowed_keys, ['PATH']);
  assert.equal(result.payload.raw_shell_string_recorded, false);
  assert.equal(result.payload.raw_env_values_recorded, false);
  assert.equal(result.payload.raw_secret_values_recorded, false);
  assert.doesNotMatch(text, /Remove-Item/);
  assert.doesNotMatch(text, /sk-commandsecret123456/);
  assert.doesNotMatch(text, /OPENAI_API_KEY/);
  assert.doesNotMatch(text, /PASSWORD/);
});
