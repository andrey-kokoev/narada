import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLifecycleTargetLocusStatus,
  createTaskLifecycleToolCaller,
  validateTaskCreatePayload,
} from '../src/tool-call-pipeline.mjs';

function makeCaller(overrides = {}) {
  const calls = [];
  const dispatchTool = async (name, args) => {
    calls.push(name);
    return { status: 'dispatched', name, args };
  };
  const caller = createTaskLifecycleToolCaller({
    toolAliases: { legacy_claim: 'task_lifecycle_claim' },
    taskLifecycleTools: () => [
      {
        name: 'task_lifecycle_claim',
        inputSchema: {
          type: 'object',
          properties: { task_number: { type: 'number' }, agent_id: { type: 'string' } },
          required: ['task_number', 'agent_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'task_lifecycle_bridge_poll',
        inputSchema: {
          type: 'object',
          properties: { dry_run: { type: 'boolean' } },
          additionalProperties: false,
        },
      },
    ],
    siteRoot: 'D:/code/site-a',
    dispatchTool,
    refreshStore: () => false,
    jsonToolResult: (payload, isError = false) => ({ payload, isError }),
    resolveToolPayloadArgs: ({ args }) => ({ args }),
    enforceInlinePayloadLimit: () => undefined,
    locusGuardedMutationTools: new Set(['task_lifecycle_claim', 'task_lifecycle_bridge_poll']),
    ...overrides,
  });
  return { caller, calls };
}

test('validateTaskCreatePayload validates immutable create payload content', () => {
  assert.throws(() => validateTaskCreatePayload({}), /task_lifecycle_create_payload_title_required/);
  assert.throws(
    () => validateTaskCreatePayload({ title: 'T', acceptance_criteria: [1] }),
    /task_lifecycle_create_payload_acceptance_criteria_must_be_string_array/,
  );
  assert.doesNotThrow(() => validateTaskCreatePayload({ title: 'T', acceptance_criteria: ['done'] }));
});

test('buildLifecycleTargetLocusStatus reports operator-stated root mismatch', () => {
  const status = buildLifecycleTargetLocusStatus({
    siteRoot: 'D:/code/site-a',
    env: { NARADA_TARGET_SITE_ROOT: 'D:/code/site-b' },
  });

  assert.equal(status.status, 'operator_stated_locus_mismatch');
  assert.equal(status.default_target_site_root, 'D:/code/site-a');
});

test('tool caller returns schema validation errors before dispatch', async () => {
  const { caller, calls } = makeCaller();

  const result = await caller({ name: 'legacy_claim', arguments: { task_number: 7 } });

  assert.deepEqual(calls, []);
  assert.equal(result.isError, true);
  assert.equal(result.payload.status, 'error');
});

test('tool caller lets dry-run bridge mutations bypass locus mismatch', async () => {
  const { caller } = makeCaller({ env: { NARADA_TARGET_SITE_ROOT: 'D:/code/site-b' } });

  const result = await caller({ name: 'task_lifecycle_bridge_poll', arguments: { dry_run: true } });

  assert.deepEqual(result, {
    status: 'dispatched',
    name: 'task_lifecycle_bridge_poll',
    args: { dry_run: true },
  });
});

test('tool caller refreshes and retries once after store errors', async () => {
  let attempts = 0;
  let refreshed = false;
  const { caller } = makeCaller({
    dispatchTool: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('SQLITE_BUSY: database is locked');
      return { status: 'ok', attempts };
    },
    refreshStore: () => {
      refreshed = true;
      return true;
    },
  });

  const result = await caller({ name: 'legacy_claim', arguments: { task_number: 7, agent_id: 'a' } });
  assert.deepEqual(result, { status: 'ok', attempts: 2 });
  assert.equal(refreshed, true);
});
