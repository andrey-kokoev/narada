import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  narsSessionsRootFromSiteRoot,
  resolveNaradaSitePaths,
  siteAuthorityRootFromSiteRoot,
} from './index.mjs';

test('resolves workspace-style sonar Site root to Site authority root', () => {
  const siteRoot = 'D:/code/narada.sonar';
  const paths = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_1' });

  assert.equal(paths.rootKind, 'workspace_root');
  assert.equal(paths.siteRoot, resolve(siteRoot));
  assert.equal(paths.workspaceRoot, resolve(siteRoot));
  assert.equal(paths.siteAuthorityRoot, resolve('D:/code/narada.sonar/.narada'));
  assert.equal(paths.narsSessionsRoot, resolve('D:/code/narada.sonar/.narada/crew/nars-sessions'));
  assert.equal(paths.narsSessionDir, resolve('D:/code/narada.sonar/.narada/crew/nars-sessions/carrier_1'));
  assert.equal(paths.narsControlSidebandPath, join(paths.narsSessionDir, 'control.jsonl'));
  assert.equal(paths.narsControlPath, join(paths.narsSessionDir, 'control.jsonl'));
  assert.equal(paths.narsOperatorInputQueuePath, join(paths.narsSessionDir, 'operator-input-queue.json'));
  assert.equal(paths.narsEventsPath, join(paths.narsSessionDir, 'events.jsonl'));
});

test('resolves staccato .narada Site root without double-appending .narada', () => {
  const siteRoot = 'D:/code/narada.staccato/.narada';
  const paths = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_2' });

  assert.equal(paths.rootKind, 'site_authority_root');
  assert.equal(paths.siteRoot, resolve(siteRoot));
  assert.equal(paths.workspaceRoot, resolve('D:/code/narada.staccato'));
  assert.equal(paths.siteAuthorityRoot, resolve(siteRoot));
  assert.equal(paths.narsSessionsRoot, resolve('D:/code/narada.staccato/.narada/crew/nars-sessions'));
  assert.equal(paths.narsSessionPath, resolve('D:/code/narada.staccato/.narada/crew/nars-sessions/carrier_2/session.jsonl'));
});

test('resolves smart-scheduling .narada Site root as authority root', () => {
  const siteRoot = 'D:/code/smart-scheduling/.narada';
  const paths = resolveNaradaSitePaths({ siteRoot });

  assert.equal(paths.rootKind, 'site_authority_root');
  assert.equal(paths.workspaceRoot, resolve('D:/code/smart-scheduling'));
  assert.equal(paths.siteAuthorityRoot, resolve(siteRoot));
  assert.equal(paths.narsSessionsRoot, resolve('D:/code/smart-scheduling/.narada/crew/nars-sessions'));
});

test('resolves user-site-like root as workspace-style Site root', () => {
  const siteRoot = 'C:/Users/Andrey/Narada';
  const paths = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_user' });

  assert.equal(paths.rootKind, 'workspace_root');
  assert.equal(paths.siteAuthorityRoot, resolve('C:/Users/Andrey/Narada/.narada'));
  assert.equal(paths.runtimeRoot, resolve('C:/Users/Andrey/Narada/.narada/.ai/runtime'));
  assert.equal(paths.narsSessionIndexRecordPath, resolve('C:/Users/Andrey/Narada/.narada/crew/nars-sessions/carrier_user/session-index-record.json'));
});

test('convenience helpers delegate to canonical resolver', () => {
  assert.equal(
    siteAuthorityRootFromSiteRoot('D:/code/narada.staccato/.narada'),
    resolve('D:/code/narada.staccato/.narada'),
  );
  assert.equal(
    narsSessionsRootFromSiteRoot('D:/code/narada.sonar'),
    resolve('D:/code/narada.sonar/.narada/crew/nars-sessions'),
  );
});

test('requires a non-empty root', () => {
  assert.throws(() => resolveNaradaSitePaths(), /site_root_required/);
  assert.throws(() => resolveNaradaSitePaths({ siteRoot: '   ' }), /site_root_required/);
});
