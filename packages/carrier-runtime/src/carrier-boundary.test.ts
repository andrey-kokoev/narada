import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

test('carrier runtime contains only the stateless turn adapter', () => {
  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const implementationFiles = readdirSync(sourceDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
  assert.deepEqual(implementationFiles.sort(), ['carrier-turn-adapter.ts', 'index.ts']);
  for (const file of implementationFiles) {
    const source = readFileSync(join(sourceDir, file), 'utf8');
    assert.doesNotMatch(source, /node:fs|appendFileSync|writeFileSync|createNarsSessionCore|discoverAndStartMcpServers/);
  }
  const adapterSource = readFileSync(join(sourceDir, 'carrier-turn-adapter.ts'), 'utf8');
  assert.match(adapterSource, /export async function runTurn\(\s*context: CarrierTurnContext/s);
});
