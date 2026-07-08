import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchProcessOwnership, launchSessionIdFromToken } from './index.mjs';

test('derives stable launch session ids from materialized launch tokens', () => {
  assert.equal(launchSessionIdFromToken('1783540000-abcd.json'), 'launch_1783540000-abcd');
  assert.equal(launchSessionIdFromToken('bad token!.json'), 'launch_bad-token');
  assert.equal(launchSessionIdFromToken(''), null);
});

test('builds session-owned cleanup ownership evidence', () => {
  const ownership = buildLaunchProcessOwnership({
    launchSessionId: 'launch_fixture',
    processRole: 'runtime_server',
    siteRoot: 'D:/code/site',
    workspaceRoot: 'D:/code/site',
    createdByPid: 10,
    pid: 20,
  });
  assert.deepEqual(ownership, {
    schema: 'narada.launch_process_ownership.v1',
    launch_session_id: 'launch_fixture',
    ownership: 'session_owned',
    process_role: 'runtime_server',
    owner_site_root: 'D:/code/site',
    workspace_root: 'D:/code/site',
    created_by_pid: 10,
    launch_supervisor_pid: null,
    cleanup_policy: 'terminate_with_launch_session',
    transfer_policy: 'explicit_only',
    pid: 20,
    evidence_status: 'complete',
    validation_errors: [],
  });
});

test('marks invalid or incomplete ownership evidence partial', () => {
  const ownership = buildLaunchProcessOwnership({ launchSessionId: '', ownership: 'ambient', processRole: 'mystery' });
  assert.equal(ownership.evidence_status, 'partial');
  assert.deepEqual(ownership.validation_errors, [
    'ownership_unknown_or_invalid',
    'process_role_unknown_or_invalid',
    'launch_session_id_missing',
  ]);
});
