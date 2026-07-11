import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  activateTargetAuthority,
  authorityTransitionStatePathFromSessionPath,
  beginSourceDrain,
  classifySourceWriteAdmission,
  classifyTargetWriteAdmission,
  emptyAuthorityTransitionSourceState,
  planTargetAuthorityTransition,
  prepareTargetAuthority,
  readAuthorityTransitionSourceState,
  sealSourceAuthority,
} from './authority-transition-state.mjs';

test('authority transition persists preparation, sealing, and target activation evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-authority-transition-'));
  const sessionPath = join(root, 'session.jsonl');
  const statePath = authorityTransitionStatePathFromSessionPath(sessionPath);
  try {
    const plan = planTargetAuthorityTransition({
      currentSiteRoot: root,
      currentSessionId: 'session-source',
      targetAuthorityLocator: { kind: 'local', session_id: 'session-target' },
    });
    assert.equal(plan.status, 'ready');
    assert.equal(plan.target_authority_locator.session_id, 'session-target');

    let state = prepareTargetAuthority({
      path: statePath,
      state: emptyAuthorityTransitionSourceState({ path: statePath }),
      transitionPlan: plan,
      targetAuthorityLocator: plan.target_authority_locator,
      now: new Date('2026-07-10T00:00:00.000Z'),
    });
    assert.equal(state.authority_transition_state, 'preparing_target');

    state = beginSourceDrain({
      path: statePath,
      state,
      now: new Date('2026-07-10T00:01:00.000Z'),
    });
    assert.equal(classifySourceWriteAdmission(state).admitted, false);

    state = sealSourceAuthority({
      path: statePath,
      state,
      sourceLastSequence: 7,
      now: new Date('2026-07-10T00:02:00.000Z'),
    });
    assert.deepEqual(classifyTargetWriteAdmission(state).missing, [
      'authority_epoch_token',
      'target_first_sequence',
    ]);

    state = activateTargetAuthority({
      path: statePath,
      state,
      activationId: 'activation-1',
      targetFirstSequence: 8,
      authorityEpochToken: { epoch: 2 },
      now: new Date('2026-07-10T00:03:00.000Z'),
    });
    assert.equal(classifyTargetWriteAdmission(state, { nextEventSequence: 8 }).admitted, true);
    assert.equal(readAuthorityTransitionSourceState(statePath).activation_id, 'activation-1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('corrupt authority transition state fails closed to a marked empty snapshot', () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-authority-transition-corrupt-'));
  const statePath = join(root, 'authority-transition-state.json');
  try {
    writeFileSync(statePath, '{', 'utf8');
    const state = readAuthorityTransitionSourceState(statePath);
    assert.equal(state.corrupt, true);
    assert.equal(state.source_write_admission, 'active');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
