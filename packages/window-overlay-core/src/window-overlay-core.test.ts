import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OVERLAY_DOCUMENT_SCHEMA,
  createOverlayDocument,
  defaultLocalAppDataRoot,
  defaultOverlayStateRoot,
  normalizeOverlayEnvironment,
  overlayPaths,
  overlayStatus,
  requestOverlayFocus,
} from './index.js';

test('creates a versioned generic document with controlled actions', () => {
  const document = createOverlayDocument({
    id: 'example',
    title: 'Example',
    rows: [{ label: 'State', value: 'ready', tone: 'success', tooltip: 'State details' }],
    actions: [
      { id: 'open', label: 'Open', kind: 'open_url', target: 'http://127.0.0.1:61729/' },
      { id: 'restart', label: 'Restart', icon: '↻', tooltip: 'Restart overlay', kind: 'restart' },
    ],
  });
  assert.equal(document.schema, OVERLAY_DOCUMENT_SCHEMA);
  assert.equal(document.rows[0].tone, 'success');
  assert.equal(document.rows[0].tooltip, 'State details');
  assert.equal(document.actions[0].kind, 'open_url');
  assert.equal(document.actions[1].kind, 'restart');
  assert.equal(document.actions[1].icon, '↻');
  assert.equal(document.actions[1].tooltip, 'Restart overlay');
});

test('action runner records bounded durable completion only after readiness', async () => {
  const source = await readFile(new URL('./Invoke-WindowSurfaceOverlayAction.ps1', import.meta.url), 'utf8');
  assert.match(source, /narada\.window_surface_overlay\.action_state\.v1/);
  assert.match(source, /Move-Item -Path \$temporary -Destination \$StatePath -Force/);
  assert.match(source, /success_probe_url/);
  assert.match(source, /Write-ActionState 'succeeded'/);
});

test('inspect reconciles an abandoned running action as interrupted', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-overlay-action-'));
  try {
    const paths = overlayPaths('example', { stateRoot });
    await mkdir(paths.stateDirectory, { recursive: true });
    await writeFile(paths.actionState, JSON.stringify({
      schema: 'narada.window_surface_overlay.action_state.v1',
      action_id: 'restart',
      request_id: 'request-1',
      status: 'running',
      started_at: new Date().toISOString(),
      pid: 2147483647,
    }), 'utf8');
    const status = await overlayStatus('example', { stateRoot });
    assert.equal(status.action_state?.status, 'interrupted');
    assert.equal(status.action_state?.detail, 'The action process exited without recording a terminal result.');
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
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
  assert.match(paths.actionState, /example[\\/]action-state\.json$/);
  assert.match(paths.focus, /example[\\/]focus\.signal$/);
});

test('normalizes the Windows WPF environment without mutating the caller', () => {
  const input: NodeJS.ProcessEnv = { SystemRoot: 'C:\\WINDOWS' };
  const normalized = normalizeOverlayEnvironment(input);
  if (process.platform === 'win32') assert.equal(normalized.windir, 'C:\\WINDOWS');
  else assert.equal(normalized.windir, undefined);
  assert.equal(input.windir, undefined);
});

test('derives the Windows user-local AppData root when carriers omit LOCALAPPDATA', () => {
  assert.equal(defaultLocalAppDataRoot({ USERPROFILE: 'C:\\Users\\Carrier' }), 'C:\\Users\\Carrier\\AppData\\Local');
  if (process.platform === 'win32') {
    const normalized = normalizeOverlayEnvironment({ USERPROFILE: 'C:\\Users\\Carrier', PATHEXT: '.CPL' });
    assert.equal(normalized.LOCALAPPDATA, 'C:\\Users\\Carrier\\AppData\\Local');
    assert.equal(normalized.PATHEXT?.includes('.EXE'), true);
  }
});

test('PowerShell host owns presentation mechanics, not provider data logic', async () => {
  const source = await readFile(new URL('./window-surface-overlay.ps1', import.meta.url), 'utf8');
  const positionSource = await readFile(new URL('./WindowSurfaceOverlayPosition.ps1', import.meta.url), 'utf8');
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
  assert.match(source, /\$line\.ColumnDefinitions\[0\]\.Width = New-Object Windows\.GridLength\(1, \[Windows\.GridUnitType\]::Auto\)/);
  assert.match(source, /\$line\.ColumnDefinitions\[1\]\.Width = New-Object Windows\.GridLength\(1, \[Windows\.GridUnitType\]::Star\)/);
  assert.match(source, /\$value\.TextWrapping = 'Wrap'/);
  assert.match(source, /\$value\.TextTrimming = 'None'/);
  assert.match(source, /\$value\.HorizontalAlignment = 'Stretch'/);
  assert.match(source, /\$row\.tooltip/);
  assert.match(source, /\$header\.Cursor = \[Windows\.Input\.Cursors\]::SizeAll/);
  assert.match(source, /\$titlePanel\.Cursor = \[Windows\.Input\.Cursors\]::SizeAll/);
  assert.match(source, /\$headerActions\.HorizontalAlignment = 'Right'/);
  assert.match(source, /GetForegroundWindow/);
  assert.match(source, /GetWindowText/);
  assert.match(source, /ShowWindow/);
  assert.match(source, /SetForegroundWindow/);
  assert.match(source, /AttachThreadInput/);
  assert.match(source, /ForceForegroundWindow/);
  assert.match(source, /function Focus-Overlay/);
  assert.match(source, /\$script:lastFocusStamp/);
  assert.match(source, /\$script:lastDocumentStamp/);
  assert.match(source, /\$script:lastRefreshStamp/);
  assert.match(source, /Remove-Item -LiteralPath \$focusPath/);
  assert.match(source, /GetWindowThreadProcessId/);
  assert.match(source, /Test-WindowsTerminalActive/);
  assert.match(source, /OverlayWindowTitlePrefix/);
  assert.match(source, /function Test-NaradaOverlayActive/);
  assert.match(source, /\(Test-NaradaOverlayActive\)/);
  assert.match(source, /\[bool\]\$window\.IsActive/);
  assert.match(source, /function Set-OverlayVisibility/);
  assert.match(source, /visibilityTimer/);
  assert.match(source, /New-Object Windows\.Application/);
  assert.match(source, /\$window\.Show\(\)/);
  assert.match(source, /\$application\.Run\(\)/);
  assert.match(source, /WindowSurfaceOverlayPosition\.ps1/);
  assert.match(source, /MonitorFromPoint/);
  assert.match(source, /GetDpiForMonitor/);
  assert.match(source, /Get-OverlayMonitor/);
  assert.match(source, /Get-NearestOverlayPositionPreference/);
  assert.match(source, /Restore-OverlayPosition/);
  assert.match(source, /Add_LocationChanged/);
  assert.match(source, /Drag-OverlayAndPersistPosition/);
  assert.match(positionSource, /narada\.window_surface_overlay\.preferences\.v2/);
  assert.match(positionSource, /top-left/);
  assert.match(positionSource, /top-right/);
  assert.match(positionSource, /bottom-left/);
  assert.match(positionSource, /bottom-right/);
  assert.match(positionSource, /Clamp-OverlayPosition/);
  assert.match(positionSource, /Read-OverlayPositionPreference/);
  assert.doesNotMatch(source, /\$window\.ShowDialog\(\)/);
  assert.match(source, /Start-RestartCommand/);
  assert.match(source, /Apply-ActionState/);
  assert.match(source, /window_surface_overlay_restart_already_running/);
  assert.match(source, /The prior restart runner is no longer active/);
  assert.match(source, /Console restarted/);
  assert.match(source, /DateTimeOffset\]::TryParse/);
  assert.match(source, /PositiveInfinity/);
  assert.doesNotMatch(source, /quota|provider|usage|remaining/);
});

test('PowerShell position helper anchors, clamps, and migrates legacy coordinates', { skip: process.platform !== 'win32' }, () => {
  const helperPath = fileURLToPath(new URL('./WindowSurfaceOverlayPosition.ps1', import.meta.url));
  const escapedPath = helperPath.replaceAll("'", "''");
  const command = `
    $ErrorActionPreference = 'Stop'
    . '${escapedPath}'
    $work = [pscustomobject]@{ left = 0.0; top = 0.0; right = 1280.0; bottom = 720.0 }
    $topRight = Resolve-OverlayPosition (New-OverlayPositionPreference 'top-right' 20 20) 360 200 $work
    $bottomLeft = Resolve-OverlayPosition (New-OverlayPositionPreference 'bottom-left' 30 40) 360 200 $work
    $clamped = Resolve-OverlayPosition (New-OverlayPositionPreference 'top-left' 9999 9999) 360 200 $work
    $legacyRaw = Read-OverlayPositionPreference ([pscustomobject]@{ left = 900; top = 20 })
    $legacy = Get-NearestOverlayPositionPreference $legacyRaw.left $legacyRaw.top 360 200 $work
    [pscustomobject]@{ schema = Get-OverlayPositionPreferencesSchema; topRight = $topRight; bottomLeft = $bottomLeft; clamped = $clamped; legacy = $legacy } | ConvertTo-Json -Compress -Depth 6
  `;
  const output = execFileSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
  const result = JSON.parse(output.trim()) as {
    schema: string;
    topRight: { left: number; top: number };
    bottomLeft: { left: number; top: number };
    clamped: { left: number; top: number };
    legacy: { kind: string; anchor: string; inset_x: number; inset_y: number };
  };
  assert.equal(result.schema, 'narada.window_surface_overlay.preferences.v2');
  assert.deepEqual(result.topRight, { left: 900, top: 20 });
  assert.deepEqual(result.bottomLeft, { left: 30, top: 480 });
  assert.deepEqual(result.clamped, { left: 920, top: 520 });
  assert.deepEqual(result.legacy, { kind: 'anchor', anchor: 'top-right', inset_x: 20, inset_y: 20 });
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
  assert.doesNotMatch(start, /\$focusPath/);
  assert.doesNotMatch(start, /Set-Content -Path \$focusPath/);
  assert.match(stop, /Remove-Item \$focusPath/);
});

test('existing overlay hosts are replaced when the requested visibility policy changes', async () => {
  const start = await readFile(new URL('./Start-WindowSurfaceOverlay.ps1', import.meta.url), 'utf8');
  assert.match(start, /visibilityPolicyPath/);
  assert.match(start, /storedPolicy/);
  assert.match(start, /Stop-HostForPolicyChange \$existing/);
  assert.match(start, /window_surface_overlay_policy_change_timeout/);
  assert.match(start, /-VisibilityPolicy/);
});

test('focus requests refuse stopped overlays without leaving a signal', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-overlay-focus-'));
  try {
    const paths = overlayPaths('stopped-overlay', { stateRoot });
    await assert.rejects(
      requestOverlayFocus('stopped-overlay', { stateRoot }),
      /overlay_not_running/,
    );
    await assert.rejects(
      readFile(paths.focus, 'utf8'),
      (error: any) => error?.code === 'ENOENT',
    );
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('overlay host owns durable error logging without keeping its launcher attached', async () => {
  const start = await readFile(new URL('./Start-WindowSurfaceOverlay.ps1', import.meta.url), 'utf8');
  const host = await readFile(new URL('./window-surface-overlay.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(start, /-RedirectStandard(?:Output|Error)/);
  assert.match(host, /host\.stderr\.log/);
  assert.match(host, /trap \{/);
});

test('overlay launcher completion follows launcher exit rather than descendant stdio closure', async () => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(source, /child\.once\('exit'/);
  assert.doesNotMatch(source, /child\.once\('close'/);
});

test('former Rust/AutoHotkey installation assumptions are gone', async () => {
  const source = await readFile(new URL('./Install-WindowSurfaceOverlay.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /cargo|AutoHotkey|narada-window-surface-overlay\.exe/);
});
