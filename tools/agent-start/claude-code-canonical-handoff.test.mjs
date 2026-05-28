import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mediateEffectRequest, writeEffectMediationEvidence } from './claude-code-effect-mediator.mjs';
import { CANONICAL_SURFACES, canonicalAdmissionCommand, createCanonicalHandoff } from './claude-code-canonical-handoff.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-claude-canonical-'));
}

test('mediated claude-code request becomes bounded canonical task request artifact', () => {
  const siteRoot = tempSite();
  const decision = mediateEffectRequest({
    request_id: 'req-task-canonical',
    carrier_session_id: 'carrier_session_canonical',
    agent_id: 'narada.builder',
    effect_kind: 'task',
    target_locus: 'narada_proper',
    requested_capability: 'task_proposal',
    payload: { title: 'Create a follow-up task', body: 'details omitted' },
  }, { task_proposal: true });
  const sourceEvidencePath = writeEffectMediationEvidence(siteRoot, decision);
  const { handoff, handoff_path: handoffPath, canonical_request_path: requestPath } = createCanonicalHandoff(siteRoot, decision, { sourceEvidencePath });
  const evidenceText = fs.readFileSync(handoffPath, 'utf8');
  const requestText = fs.readFileSync(requestPath, 'utf8');

  assert.equal(handoff.status, 'canonical_request_created');
  assert.equal(handoff.canonical_surface, 'task_candidate');
  assert.equal(handoff.authority_owner, 'task_governance_service');
  assert.equal(handoff.admission_command, undefined);
  assert.equal(handoff.admission_kind, 'inbox_submit_task_candidate');
  assert.deepEqual(handoff.canonical_admission_command.args.slice(0, 6), [
    'inbox', 'submit',
    '--source-kind', 'agent_report',
    '--source-ref', sourceEvidencePath,
  ]);
  assert.ok(handoff.canonical_admission_command.args.includes('--kind'));
  assert.ok(handoff.canonical_admission_command.args.includes('task_candidate'));
  assert.ok(handoff.canonical_admission_command.args.includes('--payload-file'));
  assert.ok(handoff.canonical_admission_command.args.includes(requestPath));
  assert.equal(handoff.canonical_request.schema, 'narada.task_candidate.request.v0');
  assert.equal(handoff.canonical_request.status, 'awaiting_canonical_admission');
  assert.equal(handoff.canonical_request.carrier_session_id, 'carrier_session_canonical');
  assert.equal(handoff.canonical_request.source_mediation_evidence_path, sourceEvidencePath);
  assert.deepEqual(handoff.canonical_request.payload_summary.keys, ['body', 'title']);
  assert.equal(handoff.canonical_request.raw_payload_recorded, false);
  assert.equal(handoff.canonical_request.raw_secret_values_recorded, false);
  assert.equal(handoff.direct_mutation_performed, false);
  assert.equal(handoff.canonical_authority_executed, false);
  assert.doesNotMatch(evidenceText, /Create a follow-up task/);
  assert.doesNotMatch(requestText, /Create a follow-up task/);
});

test('canonical surface mappings cover every supported claude-code effect kind', () => {
  assert.deepEqual(Object.keys(CANONICAL_SURFACES).sort(), [
    'command',
    'inbox',
    'outbox',
    'publication',
    'task',
  ]);
});

test('missing capability and ambiguous locus prevent canonical promotion', () => {
  const siteRoot = tempSite();
  const missingGrant = mediateEffectRequest({
    request_id: 'req-outbox-refused',
    carrier_session_id: 'carrier_session_canonical',
    agent_id: 'narada.builder',
    effect_kind: 'outbox',
    target_locus: 'narada_proper',
    requested_capability: 'outbox_transport',
    payload: { subject: 'not sent' },
  }, {});
  const ambiguous = mediateEffectRequest({
    request_id: 'req-command-ambiguous',
    carrier_session_id: 'carrier_session_canonical',
    agent_id: 'narada.builder',
    effect_kind: 'command',
    requested_capability: 'command_prepare',
    payload: { command: 'narada status' },
  }, { command_prepare: true });
  const missingGrantHandoff = createCanonicalHandoff(siteRoot, missingGrant).handoff;
  const ambiguousHandoff = createCanonicalHandoff(siteRoot, ambiguous).handoff;

  assert.equal(missingGrant.status, 'refused');
  assert.equal(missingGrantHandoff.status, 'refused');
  assert.equal(missingGrantHandoff.reason, 'missing_capability_grant');
  assert.equal(missingGrantHandoff.canonical_request, null);
  assert.equal(missingGrantHandoff.direct_mutation_performed, false);
  assert.equal(ambiguous.status, 'refused');
  assert.equal(ambiguousHandoff.status, 'refused');
  assert.equal(ambiguousHandoff.reason, 'target_locus_ambiguous');
  assert.equal(ambiguousHandoff.canonical_request, null);
});

test('canonical request artifacts are bounded for inbox command outbox and publication surfaces', () => {
  const siteRoot = tempSite();
  for (const effectKind of ['inbox', 'command', 'outbox', 'publication']) {
    const decision = mediateEffectRequest({
      request_id: `req-${effectKind}-canonical`,
      carrier_session_id: 'carrier_session_canonical',
      agent_id: 'narada.builder',
      effect_kind: effectKind,
      target_locus: 'narada_proper',
      requested_capability: `${effectKind}_proposal`,
      payload: {
        summary: `${effectKind} raw text must not persist`,
      },
    }, { [`${effectKind}_proposal`]: true });
    const { handoff, handoff_path: handoffPath } = createCanonicalHandoff(siteRoot, decision, {
      sourceEvidencePath: `source-${effectKind}.json`,
    });
    const evidenceText = fs.readFileSync(handoffPath, 'utf8');

    assert.equal(handoff.status, 'canonical_request_created');
    assert.equal(handoff.canonical_surface, CANONICAL_SURFACES[effectKind].surface);
    assert.equal(handoff.admission_command, undefined);
    assert.equal(handoff.canonical_admission_command.executable, 'narada');
    assert.equal(handoff.canonical_admission_command.mutates_canonical_surface_only, true);
    assert.equal(handoff.canonical_request.raw_payload_recorded, false);
    assert.equal(handoff.canonical_request.raw_secret_values_recorded, false);
    assert.equal(handoff.direct_mutation_performed, false);
    assert.equal(handoff.canonical_authority_executed, false);
    assert.doesNotMatch(evidenceText, /raw text must not persist/);
  }
});

test('canonical admission commands use existing canonical CLI shapes', () => {
  const siteRoot = tempSite();
  const expected = {
    task: ['inbox', 'submit', '--kind', 'task_candidate'],
    inbox: ['inbox', 'submit', '--kind', 'proposal'],
    command: ['inbox', 'submit', '--kind', 'command_request'],
    outbox: ['outbox', 'compose', '--target-kind', 'claude_code_effect_request'],
    publication: ['publication', 'prepare', '--include'],
  };

  for (const [effectKind, fragments] of Object.entries(expected)) {
    const decision = mediateEffectRequest({
      request_id: `req-${effectKind}-admission`,
      carrier_session_id: 'carrier_session_canonical',
      agent_id: 'narada.builder',
      effect_kind: effectKind,
      target_locus: 'narada_proper',
      requested_capability: `${effectKind}_proposal`,
      payload: { summary: `${effectKind} raw text must not persist` },
    }, { [`${effectKind}_proposal`]: true });
    const { handoff, canonical_request_path: requestPath } = createCanonicalHandoff(siteRoot, decision, {
      sourceEvidencePath: `source-${effectKind}.json`,
    });
    const command = canonicalAdmissionCommand(handoff, requestPath);
    const commandText = command.args.join(' ');

    assert.equal(command.executable, 'narada');
    for (const fragment of fragments) {
      assert.match(commandText, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.doesNotMatch(commandText, /payload-file <request>|intent-file <request>|inbox task --payload-file/);
    assert.doesNotMatch(commandText, /raw text must not persist/);
  }
});

test('canonical admission can be delegated to canonical runner without carrier direct mutation', () => {
  const siteRoot = tempSite();
  const calls = [];
  const decision = mediateEffectRequest({
    request_id: 'req-task-admit',
    carrier_session_id: 'carrier_session_canonical',
    agent_id: 'narada.builder',
    effect_kind: 'task',
    target_locus: 'narada_proper',
    requested_capability: 'task_proposal',
    payload: { title: 'Create a follow-up task', body: 'details omitted' },
  }, { task_proposal: true });
  const { handoff, canonical_admission_result: result } = createCanonicalHandoff(siteRoot, decision, {
    sourceEvidencePath: 'source-task.json',
    admit: true,
    runCanonicalCommand(command, context) {
      calls.push({ command, context });
      return { status: 'success', envelope_id: 'env_task_candidate' };
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(handoff.canonical_authority_executed, true);
  assert.equal(handoff.direct_mutation_performed, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].command.args.slice(0, 2), ['inbox', 'submit']);
  assert.equal(calls[0].context.cwd, siteRoot);
});
