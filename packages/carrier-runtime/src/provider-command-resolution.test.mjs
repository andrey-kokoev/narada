import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const runtimeDependenciesSource = readFileSync(fileURLToPath(new URL('./runtime-dependencies.mjs', import.meta.url)), 'utf8');

test('codex-subscription provider execution uses shared command resolver', () => {
  assert.match(runtimeDependenciesSource, /@narada2\/carrier-provider-support\/codex-subscription-command/);
  assert.match(runtimeDependenciesSource, /resolveCodexCommand\(/);
  assert.doesNotMatch(runtimeDependenciesSource, /NARADA_CODEX_EXEC_COMMAND \?\? process\.env\.NARADA_CODEX_COMMAND \?\? process\.env\.CODEX_COMMAND \?\? 'codex'/);
});

test('codex-subscription provider execution classifies unresolved CLI spawn failures', () => {
  assert.match(runtimeDependenciesSource, /codex_cli_unresolved/);
  assert.match(runtimeDependenciesSource, /NARADA_CODEX_EXEC_COMMAND\/NARADA_CODEX_COMMAND/);
});
