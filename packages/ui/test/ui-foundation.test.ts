import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('build publishes the shared stylesheet export', async () => {
  const css = await readFile(resolve(packageRoot, 'dist/styles.css'), 'utf8');

  assert.match(css, /--bg:/);
  assert.match(css, /--surface:/);
  assert.match(css, /\.truncate/);
  assert.match(css, /prefers-color-scheme:dark/);
  await assert.rejects(access(resolve(packageRoot, 'dist/index.js')));
});

test('plain HTML consumer references the package stylesheet', async () => {
  const html = await readFile(resolve(packageRoot, 'test/fixtures/plain-consumer.html'), 'utf8');

  assert.match(html, /href="\.\.\/\.\.\/dist\/styles\.css"/);
  assert.match(html, /class="[^"]*narada-list-reset/);
});
