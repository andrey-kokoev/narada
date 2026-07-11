import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Vue consumer fixture imports the public component package', async () => {
  const app = await readFile(resolve(packageRoot, 'test/fixture/App.vue'), 'utf8');
  const html = await readFile(resolve(packageRoot, 'dist-fixture/index.html'), 'utf8');

  assert.match(app, /from '@narada2\/ui-vue'/);
  assert.match(app, /<TooltipProvider>/);
  assert.match(app, /<CommandItem/);
  assert.match(html, /assets\//);
});
