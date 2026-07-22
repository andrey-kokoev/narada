import assert from 'node:assert/strict';
import test from 'node:test';

import { localExecutionEvidence } from '../src/server-wrapper.mjs';

test('launcher handoff remains ready when its detached parent is unavailable', () => {
  const session = 'launcher-handoff-test';
  const launcher = localExecutionEvidence({
    lifecycleBinding: { session_id: session },
    launchProcessContext: { createdByPid: null },
  }).find(({ component_kind }) => component_kind === 'launcher');

  assert.equal(launcher.status, 'ready');
  assert.equal(launcher.process_id, undefined);
  assert.match(launcher.deployment_ref, /^agent-start:/);
  assert.equal(launcher.evidence_class, 'durable');
  assert.match(launcher.evidence_ref, new RegExp(`^local-execution:${session}:launcher:agent-start:`));
});
