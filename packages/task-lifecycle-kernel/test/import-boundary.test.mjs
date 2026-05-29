import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kernelRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  'src/index.mjs',
  'src/stdio-json-rpc.mjs',
  'src/tool-call-pipeline.mjs',
];

for (const file of files) {
  const source = readFileSync(join(kernelRoot, file), 'utf8');
  assert.equal(source.includes('@narada2/task-governance'), false, `${file} must not import task-governance`);
}

console.log('task lifecycle kernel import boundary tests passed');
