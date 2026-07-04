import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { codexAuthHome } from './codex-subscription-auth.mjs';

test('codexAuthHome uses explicit Narada auth home first', () => {
  assert.equal(codexAuthHome({
    processEnv: {
      NARADA_CODEX_AUTH_HOME: 'D:/secrets/codex-auth',
      USERPROFILE: 'C:/Users/Andrey',
      HOME: 'D:/home',
    },
    osHomedir: () => 'ignored',
  }), 'D:/secrets/codex-auth');
});

test('codexAuthHome resolves user profile Codex home', () => {
  assert.equal(codexAuthHome({
    processEnv: { USERPROFILE: 'C:/Users/Andrey', HOME: 'D:/home' },
    osHomedir: () => 'ignored',
  }), join('C:/Users/Andrey', '.codex'));
});

test('codexAuthHome resolves HOME when USERPROFILE is unavailable', () => {
  assert.equal(codexAuthHome({
    processEnv: { HOME: 'D:/home' },
    osHomedir: () => 'ignored',
  }), join('D:/home', '.codex'));
});

test('codexAuthHome resolves OS home when environment has no user home', () => {
  assert.equal(codexAuthHome({
    processEnv: {},
    osHomedir: () => 'D:/os-home',
  }), join('D:/os-home', '.codex'));
});

test('codexAuthHome returns null when no home can be resolved', () => {
  assert.equal(codexAuthHome({ processEnv: {}, osHomedir: () => '' }), null);
});
