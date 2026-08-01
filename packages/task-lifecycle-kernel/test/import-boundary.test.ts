import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kernelRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  'src/index.ts',
  'src/stdio-json-rpc.ts',
  'src/tool-call-pipeline.ts',
];

for (const file of files) {
  const source = readFileSync(join(kernelRoot, file), 'utf8');
  assert.equal(source.includes('@narada-core/task-governance'), false, `${file} must not import task-governance`);
}

console.log('task lifecycle kernel import boundary tests passed');
