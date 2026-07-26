import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptPath = new URL('./test-agent-tui.ps1', import.meta.url);

async function scriptText() {
  return await readFile(scriptPath, 'utf8');
}

test('agent-tui test wrapper defaults to quiet focused tests', async () => {
  const script = await scriptText();

  assert.match(script, /\[string\]\$Filter = 'mcp_runtime'/);
  assert.match(script, /if \(-not \$VerboseOutput\) \{\s*\$cargoArgs \+= '--quiet'\s*\}/m);
  assert.match(script, /if \(-not \$Full\)/);
  assert.match(script, /Write-Host "agent-tui tests passed \(\$testScope\)"/);
});

test('agent-tui test wrapper prints raw cargo output only for verbose or failure', async () => {
  const script = await scriptText();

  assert.match(script, /if \(\$VerboseOutput -or \$exitCode -ne 0\) \{/);
  assert.match(script, /\$output \| ForEach-Object \{ Write-Host \$_ \}/);
});
