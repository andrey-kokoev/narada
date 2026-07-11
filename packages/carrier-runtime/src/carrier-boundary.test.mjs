import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

test('carrier runtime contains only the stateless turn adapter', () => {
  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const implementationFiles = readdirSync(sourceDir)
    .filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs'));
  assert.deepEqual(implementationFiles.sort(), ['carrier-turn-adapter.mjs', 'index.mjs']);
  for (const file of implementationFiles) {
    const source = readFileSync(join(sourceDir, file), 'utf8');
    assert.doesNotMatch(source, /node:fs|appendFileSync|writeFileSync|createNarsSessionCore|discoverAndStartMcpServers/);
  }
  const adapterSource = readFileSync(join(sourceDir, 'carrier-turn-adapter.mjs'), 'utf8');
  assert.match(adapterSource, /runTurn\(context.*eventSink.*toolGateway/s);
});
