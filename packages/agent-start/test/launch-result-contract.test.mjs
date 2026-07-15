import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { buildLauncherContractsFromAgentStartResult } from '../src/launch-result-contracts.ts';
import { writeJsonFileAtomically, writeLaunchResultFile } from '../src/carrier-launch-artifacts.ts';
import {
  AgentStartResultV0Schema,
  assertAgentStartResultV0,
  evaluateAgentStartHandoff,
  parseAgentStartResultV0,
} from '../src/launch-result-v0-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('resolves the canonical contract through the package export', async () => {
  const contract = await import('@narada2/agent-start/launch-result-v0-contract');
  assert.equal(contract.AGENT_START_RESULT_SCHEMA, 'narada.agent_start.result.v0');
  assert.equal(typeof contract.assertAgentStartResultV0, 'function');
});

test('does not classify canonical launch artifacts as failures', () => {
  for (const status of ['materialized', 'dry_run']) {
    const contracts = buildLauncherContractsFromAgentStartResult({
      schema: 'narada.agent_start.result.v0',
      status,
      ...(status === 'materialized' ? { handoff: { session_ref: { id: 'session_contract', kind: 'runtime' } } } : {}),
      ...(status === 'materialized' ? { runtime_session_id: 'session_contract' } : {}),
      exec: status === 'materialized',
      ...(status === 'materialized' ? { agent_start_event: 'evt_test' } : {}),
    });

    assert.equal(contracts.launch_result_artifact.failure_reference, null, status);
    assert.equal(contracts.launch_failure_rendering, null, status);
  }
});

test('treats generic session aliases as declared identities during conflict detection', () => {
  const result = {
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    handoff: { session_ref: { id: 'runtime_a', kind: 'runtime' } },
    nars_launch: { session_id: 'runtime_b', runtime_session_id: 'runtime_a' },
  };

  assert.equal(evaluateAgentStartHandoff(result).reason, 'materialized_result_session_ref_conflict');
});

test('treats top-level session aliases as canonical declarations', () => {
  const coherent = {
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    handoff: { session_ref: { id: 'runtime_top_level', kind: 'runtime' } },
    session_id: 'runtime_top_level',
    runtime_session_id: 'runtime_top_level',
  };
  assert.equal(evaluateAgentStartHandoff(coherent).status, 'eligible');

  const conflicting = { ...coherent, session_id: 'runtime_other' };
  assert.equal(evaluateAgentStartHandoff(conflicting).reason, 'materialized_result_session_ref_conflict');
});

test('rejects legacy v0 materialized results without a canonical handoff', () => {
  const legacy = {
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    carrier_session: { carrier_session_id: 'carrier_legacy' },
  };
  assert.equal(parseAgentStartResultV0(legacy).success, false);
  assert.equal(evaluateAgentStartHandoff(legacy).status, 'invalid');
  assert.throws(() => assertAgentStartResultV0(legacy), /agent_start_result_contract_invalid/);
});

test('rejects non-canonical launch failures before broader projection', () => {
  assert.throws(() => buildLauncherContractsFromAgentStartResult({
    status: 'refused',
    reason: 'provider unavailable',
  }), /agent_start_result_contract_invalid/);
});

test('accepts canonical materialized results and preserves additive fields', () => {
  const result = {
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    identity: 'sonar.resident',
    runtime: 'narada-agent-runtime-server',
    agent_start_event: 'evt_contract',
    handoff: { session_ref: { id: 'carrier_contract', kind: 'nars' } },
    nars_launch: { nars_session_id: 'carrier_contract' },
    additive_field: { preserved: true },
  };

  const parsed = parseAgentStartResultV0(result);
  assert.equal(parsed.success, true);
  assert.deepEqual(assertAgentStartResultV0(result).additive_field, { preserved: true });
  assert.deepEqual(evaluateAgentStartHandoff(result), {
    eligible: true,
    status: 'eligible',
    session_ref: { id: 'carrier_contract', kind: 'nars' },
    session_id: 'carrier_contract',
    reason: null,
    detail: null,
  });
  const contracts = buildLauncherContractsFromAgentStartResult(result);
  assert.deepEqual(contracts.launch_result_artifact.session_ref, { id: 'carrier_contract', kind: 'nars' });
  assert.equal(contracts.launch_result_artifact.nars_session_id, 'carrier_contract');
});

test('publishes only validated launch results through an atomic final path', () => {
  const siteRoot = mkdtempSync('narada-launch-result-');
  const resultDir = join(siteRoot, '.ai', 'runtime', 'agent-start-results');
  try {
    const result = {
      schema: 'narada.agent_start.result.v0',
      status: 'materialized',
      identity: 'sonar.resident',
      agent_start_event: 'evt_atomic',
      handoff: { session_ref: { id: 'runtime_atomic', kind: 'runtime' } },
      nars_launch: { runtime_session_id: 'runtime_atomic' },
    };
    const resultPath = writeLaunchResultFile(result, { siteRoot });

    assert.equal(resultPath, join(resultDir, 'evt_atomic.result.json'));
    assert.equal(existsSync(resultPath), true);
    assert.deepEqual(readdirSync(resultDir), ['evt_atomic.result.json']);
    assert.deepEqual(JSON.parse(readFileSync(resultPath, 'utf8')).handoff.session_ref, {
      id: 'runtime_atomic',
      kind: 'runtime',
    });

    assert.throws(() => writeLaunchResultFile({
      ...result,
      agent_start_event: 'evt_invalid',
      status: 'launching',
    }, { siteRoot }), /agent_start_result_contract_invalid/);
    assert.throws(() => writeLaunchResultFile({
      ...result,
      agent_start_event: 'evt_incoherent',
      nars_launch: { runtime_session_id: 'runtime_other' },
    }, { siteRoot }), /agent_start_result_handoff_invalid/);
    assert.deepEqual(readdirSync(resultDir), ['evt_atomic.result.json']);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('publishes command result JSON through an atomic replacement', () => {
  const siteRoot = mkdtempSync('narada-json-output-');
  const resultPath = join(siteRoot, 'result.json');
  try {
    writeJsonFileAtomically(resultPath, { status: 'materialized', handoff: { session_ref: { id: 'runtime_json' } } });
    assert.deepEqual(JSON.parse(readFileSync(resultPath, 'utf8')), {
      status: 'materialized',
      handoff: { session_ref: { id: 'runtime_json' } },
    });
    assert.deepEqual(readdirSync(siteRoot), ['result.json']);

    writeJsonFileAtomically(resultPath, { status: 'materialized', handoff: { session_ref: { id: 'runtime_replaced' } } });
    assert.equal(JSON.parse(readFileSync(resultPath, 'utf8')).handoff.session_ref.id, 'runtime_replaced');
    assert.deepEqual(readdirSync(siteRoot), ['result.json']);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('keeps the checked-in JSON Schema generated from the Zod contract', async () => {
  const generated = zodToJsonSchema(AgentStartResultV0Schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  const expected = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Narada agent-start result v0',
    description: 'Generated from packages/agent-start/src/launch-result-v0-contract.mts',
    ...generated,
  };
  const checkedIn = JSON.parse(await readFile(resolve(__dirname, '..', 'contracts', 'agent-start.result.v0.schema.json'), 'utf8'));
  assert.deepEqual(checkedIn, expected);
});

test('parses dry-run results but refuses them as runtime handoffs', () => {
  const result = {
    schema: 'narada.agent_start.result.v0',
    status: 'dry_run',
    identity: 'sonar.resident',
    runtime: 'narada-agent-runtime-server',
  };

  assert.equal(parseAgentStartResultV0(result).success, true);
  assert.deepEqual(evaluateAgentStartHandoff(result), {
    eligible: false,
    status: 'ineligible',
    session_ref: null,
    session_id: null,
    reason: 'result_not_materialized',
    detail: 'Only a materialized agent-start result can hand off a runtime session.',
  });
});

test('rejects unknown statuses and legacy result schemas before correlation', () => {
  for (const result of [
    { schema: 'narada.agent_start.result.v0', status: 'success' },
    { schema: 'narada.agent_start.result.v1', status: 'materialized' },
  ]) {
    const handoff = evaluateAgentStartHandoff(result);
    assert.equal(handoff.status, 'invalid');
    assert.equal(handoff.reason, 'result_contract_invalid');
    assert.throws(() => assertAgentStartResultV0(result), /agent_start_result_contract_invalid/);
  }
});

test('hands off a materialized result through its canonical session ref', () => {
  const result = {
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    identity: 'sonar.resident',
    runtime: 'narada-agent-runtime-server',
    handoff: { session_ref: { id: 'carrier_contract', kind: 'runtime' } },
    runtime_session_id: 'carrier_contract',
  };

  assert.deepEqual(evaluateAgentStartHandoff(result), {
    eligible: true,
    status: 'eligible',
    session_ref: { id: 'carrier_contract', kind: 'runtime' },
    session_id: 'carrier_contract',
    reason: null,
    detail: null,
  });
});

test('supports each canonical session reference kind with matching component identity', () => {
  for (const kind of ['runtime', 'nars', 'carrier']) {
    const id = `session_${kind}`;
    const result = {
      schema: 'narada.agent_start.result.v0',
      status: 'materialized',
      handoff: { session_ref: { id, kind } },
      ...(kind === 'runtime' ? { nars_launch: { runtime_session_id: id } } : {}),
      ...(kind === 'nars' ? { nars_launch: { nars_session_id: id } } : {}),
      ...(kind === 'carrier' ? { carrier_session: { carrier_session_id: id } } : {}),
    };

    const handoff = evaluateAgentStartHandoff(result);
    assert.equal(handoff.status, 'eligible', kind);
    assert.deepEqual(handoff.session_ref, { id, kind });
  }
});

test('rejects a canonical handoff that conflicts with a declared component identity', () => {
  const result = {
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    handoff: { session_ref: { id: 'runtime_a', kind: 'runtime' } },
    nars_launch: { runtime_session_id: 'runtime_b' },
  };

  assert.deepEqual(evaluateAgentStartHandoff(result), {
    eligible: false,
    status: 'invalid',
    session_ref: null,
    session_id: null,
    reason: 'materialized_result_session_ref_conflict',
    detail: 'handoff.session_ref conflicts with one or more declared session projections.',
  });
});

test('rejects a materialized result with an invalid canonical session ref', () => {
  const result = {
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    identity: 'sonar.resident',
    runtime: 'narada-agent-runtime-server',
    handoff: { session_ref: null },
  };

  assert.deepEqual(evaluateAgentStartHandoff(result), {
    eligible: false,
    status: 'invalid',
    session_ref: null,
    session_id: null,
    reason: 'result_contract_invalid',
    detail: 'agent_start_result_contract_invalid: <root>: Invalid input',
  });
});
