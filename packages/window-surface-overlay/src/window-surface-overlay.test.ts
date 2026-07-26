import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

test('overlay scripts resolve config through site root environment before user profile fallback', async () => {
  for (const name of [
    'Inspect-WindowSurfaceOverlay.ps1',
    'Start-WindowSurfaceOverlay.ps1',
    'Stop-WindowSurfaceOverlay.ps1',
  ]) {
    const text = await readFile(join(root, name), 'utf8');
    assert.match(text, /NARADA_USER_SITE_ROOT/);
    assert.doesNotMatch(text, /C:\\Users\\Andrey\\Narada\\operator-surfaces/);
  }
});

test('install script installs all overlay control scripts with executable', async () => {
  const text = await readFile(join(root, 'Install-WindowSurfaceOverlay.ps1'), 'utf8');
  assert.match(text, /cargo build --release/);
  assert.match(text, /Start-WindowSurfaceOverlay\.ps1/);
  assert.match(text, /Stop-WindowSurfaceOverlay\.ps1/);
  assert.match(text, /Inspect-WindowSurfaceOverlay\.ps1/);
});