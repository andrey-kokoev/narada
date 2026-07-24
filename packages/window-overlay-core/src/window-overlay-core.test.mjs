import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  OVERLAY_DOCUMENT_SCHEMA,
  createOverlayDocument,
  defaultOverlayStateRoot,
  normalizeOverlayEnvironment,
  overlayPaths,
} from './index.mjs';

test('creates a versioned generic document with controlled actions', () => {
  const document = createOverlayDocument({
    id: 'example',
    title: 'Example',
    rows: [{ label: 'State', value: 'ready', tone: 'success' }],
    actions: [
      { id: 'open', label: 'Open', kind: 'open_url', target: 'http://127.0.0.1:61729/' },
      { id: 'restart', label: 'Restart', icon: '↻', tooltip: 'Restart overlay', kind: 'restart' },
    ],
  });
  assert.equal(document.schema, OVERLAY_DOCUMENT_SCHEMA);
  assert.equal(document.rows[0].tone, 'success');
  assert.equal(document.actions[0].kind, 'open_url');
  assert.equal(document.actions[1].kind, 'restart');
  assert.equal(document.actions[1].icon, '↻');
  assert.equal(document.actions[1].tooltip, 'Restart overlay');
});

test('restart actions cannot carry executable targets', () => {
  assert.throws(() => createOverlayDocument({
    id: 'example',
    actions: [{ id: 'restart', label: 'Restart', kind: 'restart', target: 'pwsh' }],
  }), /overlay_restart_target_forbidden/);
});

test('rejects arbitrary open-url targets', () => {
  assert.throws(() => createOverlayDocument({
    id: 'example',
    actions: [{ id: 'open', label: 'Open', kind: 'open_url', target: 'file:///secret' }],
  }), /overlay_open_url_target_scheme_invalid/);
});

test('state root is user-local and overrideable', () => {
  const env = { LOCALAPPDATA: 'C:\\Local', NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT: '' };
  assert.equal(defaultOverlayStateRoot(env), 'C:\\Local\\Narada\\window-surface-overlays');
  const paths = overlayPaths('example', { stateRoot: 'C:\\State' });
  assert.match(paths.document, /example[\\/]document\.json$/);
});

test('normalizes the Windows WPF environment without mutating the caller', () => {
  const input = { SystemRoot: 'C:\\WINDOWS' };
  const normalized = normalizeOverlayEnvironment(input);
  if (process.platform === 'win32') assert.equal(normalized.windir, 'C:\\WINDOWS');
  else assert.equal(normalized.windir, undefined);
  assert.equal(input.windir, undefined);
});

test('PowerShell host owns presentation mechanics, not provider data logic', async () => {
  const source = await readFile(new URL('./window-surface-overlay.ps1', import.meta.url), 'utf8');
  assert.match(source, /PresentationFramework/);
  assert.match(source, /ShowInTaskbar/);
  assert.match(source, /DragMove/);
  assert.match(source, /Opacity/);
  assert.match(source, /New-Brush 255 18 18 25/);
  assert.match(source, /'accent'/);
  assert.doesNotMatch(source, /\$value\.TextDecorations/);
  assert.match(source, /Start-Process -FilePath \$rowTarget/);
  assert.match(source, /\$titleText\.Foreground = Get-ToneBrush/);
  assert.match(source, /\$script:PinButton\.FontSize = 12/);
  assert.match(source, /CornerRadius\(10\)/);
  assert.match(source, /ControlTemplate/);
  assert.match(source, /MouseEnter/);
  assert.match(source, /FontFamily.*Consolas/);
  assert.match(source, /New-OpacityButton/);
  assert.match(source, /\$header\.ColumnDefinitions/);
  assert.match(source, /\$header\.Height = 36/);
  assert.match(source, /\$header\.Cursor = \[Windows\.Input\.Cursors\]::SizeAll/);
  assert.match(source, /\$titlePanel\.Cursor = \[Windows\.Input\.Cursors\]::SizeAll/);
  assert.match(source, /\$headerActions\.HorizontalAlignment = 'Right'/);
  assert.match(source, /GetForegroundWindow/);
  assert.match(source, /GetWindowThreadProcessId/);
  assert.match(source, /Test-WindowsTerminalActive/);
  assert.match(source, /\[bool\]\$window\.IsActive/);
  assert.match(source, /function Set-OverlayVisibility/);
  assert.match(source, /visibilityTimer/);
  assert.match(source, /New-Object Windows\.Application/);
  assert.match(source, /\$application\.Run\(\$window\)/);
  assert.doesNotMatch(source, /\$window\.ShowDialog\(\)/);
  assert.match(source, /Start-RestartCommand/);
  assert.doesNotMatch(source, /quota|provider|usage|remaining/);
});

test('re-render replaces document actions instead of appending duplicates', async () => {
  const source = await readFile(new URL('./window-surface-overlay.ps1', import.meta.url), 'utf8');
  assert.match(source, /\$documentActions\.Children\.Clear\(\)/);
  assert.match(source, /Add-Button \$documentActions/);
  assert.match(source, /Get-ActionLabel/);
});

test('PowerShell lifecycle scripts do not shadow the automatic PID variable', async () => {
  const start = await readFile(new URL('./Start-WindowSurfaceOverlay.ps1', import.meta.url), 'utf8');
  const stop = await readFile(new URL('./Stop-WindowSurfaceOverlay.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(start, /\$pid\s*=/);
  assert.doesNotMatch(stop, /\$pid\s*=/);
  assert.match(stop, /\$overlayPid/);
});

test('former Rust/AutoHotkey installation assumptions are gone', async () => {
  const source = await readFile(new URL('./Install-WindowSurfaceOverlay.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /cargo|AutoHotkey|narada-window-surface-overlay\.exe/);
});