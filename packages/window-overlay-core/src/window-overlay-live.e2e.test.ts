import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  requestOverlayFocus,
  startOverlay,
  stopOverlay,
} from './index.js';

type NativeWindowSnapshot = {
  TargetPid: number;
  Windows: Array<{ Visible: boolean; Title: string }>;
  ForegroundPid: number;
  ForegroundTitle: string;
};

const OVERLAY_WINDOW_TITLE_PREFIX = 'Narada Overlay: ';
const overlayWindowTitle = (id: string) => `${OVERLAY_WINDOW_TITLE_PREFIX}${id}`;

const NATIVE_WINDOW_PROBE = String.raw`
$code = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class NaradaWindowOverlayLiveProbe {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public static object Read(uint targetPid) {
    var rows = new List<object>();
    EnumWindows((hWnd, lParam) => {
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (pid == targetPid) {
        var text = new StringBuilder(512);
        GetWindowText(hWnd, text, text.Capacity);
        rows.Add(new { Visible = IsWindowVisible(hWnd), Title = text.ToString() });
      }
      return true;
    }, IntPtr.Zero);
    var foreground = GetForegroundWindow();
    uint foregroundPid;
    GetWindowThreadProcessId(foreground, out foregroundPid);
    var foregroundText = new StringBuilder(512);
    GetWindowText(foreground, foregroundText, foregroundText.Capacity);
    return new { TargetPid = targetPid, Windows = rows.ToArray(), ForegroundPid = foregroundPid, ForegroundTitle = foregroundText.ToString() };
  }
}
'@;
Add-Type -TypeDefinition $code;
[NaradaWindowOverlayLiveProbe]::Read([uint32]${'${PID_VALUE}'}) | ConvertTo-Json -Depth 5
`;

function readNativeWindowSnapshot(pid: number): NativeWindowSnapshot | null {
  const command = NATIVE_WINDOW_PROBE.replace('${PID_VALUE}', String(pid));
  try {
    return JSON.parse(execFileSync('pwsh', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      command,
    ], { encoding: 'utf8' }).trim()) as NativeWindowSnapshot;
  } catch {
    return null;
  }
}

let livePid = 0;

async function waitForSnapshot(
  pid: number,
  predicate: (snapshot: NativeWindowSnapshot) => boolean,
  timeoutMs = 7_000,
): Promise<NativeWindowSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot: NativeWindowSnapshot | null = null;
  while (Date.now() < deadline) {
    lastSnapshot = readNativeWindowSnapshot(pid);
    if (lastSnapshot && predicate(lastSnapshot)) return lastSnapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`overlay_live_window_expectation_failed:${JSON.stringify(lastSnapshot)}`);
}

test('live WPF overlay remains visible and focusable through its native HWND', {
  skip: process.platform !== 'win32',
}, async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-window-overlay-live-'));
  try {
    const started = await startOverlay({
      id: 'live-overlay-e2e',
      stateRoot,
      visibilityPolicy: 'always',
      refreshSeconds: 1,
      document: {
        title: 'Live overlay E2E',
        rows: [{ label: 'State', value: 'running', tone: 'success' }],
      },
    });
    livePid = started.pid ?? 0;
    assert.ok(livePid > 0, 'live overlay must expose a host PID');

    const visibleAfterStart = await waitForSnapshot(livePid, (snapshot) => snapshot.Windows.some(
      (window) => window.Visible && window.Title === overlayWindowTitle('live-overlay-e2e'),
    ));
    assert.notEqual(visibleAfterStart.ForegroundPid, 0, 'the live desktop must have a foreground window');

    await requestOverlayFocus('live-overlay-e2e', { stateRoot });
    const focusedAfterRequest = await waitForSnapshot(livePid, (snapshot) => snapshot.ForegroundPid === livePid);
    assert.equal(focusedAfterRequest.ForegroundPid, livePid);

    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const stable = readNativeWindowSnapshot(livePid);
    assert.ok(stable, 'overlay host must remain probeable after the visibility timer runs');
    assert.ok(stable.Windows.some(
      (window) => window.Visible && window.Title === overlayWindowTitle('live-overlay-e2e'),
    ), 'overlay HWND must remain visible under the always policy');
  } finally {
    await stopOverlay({ id: 'live-overlay-e2e', stateRoot }).catch(() => undefined);
    await rm(stateRoot, { recursive: true, force: true });
    livePid = 0;
  }
});

test('live start applies a changed visibility policy to an existing host', {
  skip: process.platform !== 'win32',
}, async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-window-overlay-policy-live-'));
  let firstPid = 0;
  let secondPid = 0;
  try {
    const first = await startOverlay({
      id: 'live-overlay-policy',
      stateRoot,
      visibilityPolicy: 'windows-terminal',
      refreshSeconds: 1,
      document: {
        title: 'Live policy overlay',
        rows: [{ label: 'Policy', value: 'terminal-scoped', tone: 'warning' }],
      },
    });
    firstPid = first.pid ?? 0;
    assert.ok(firstPid > 0, 'initial overlay must expose a host PID');

    const second = await startOverlay({
      id: 'live-overlay-policy',
      stateRoot,
      visibilityPolicy: 'always',
      refreshSeconds: 1,
      document: {
        title: 'Live policy overlay',
        rows: [{ label: 'Policy', value: 'always-visible', tone: 'success' }],
      },
    });
    secondPid = second.pid ?? 0;
    assert.ok(secondPid > 0, 'replacement overlay must expose a host PID');
    assert.notEqual(secondPid, firstPid, 'a changed visibility policy must replace the old host');

    const visible = await waitForSnapshot(secondPid, (snapshot) => snapshot.Windows.some(
      (window) => window.Visible && window.Title === overlayWindowTitle('live-overlay-policy'),
    ));
    assert.ok(visible.Windows.some(
      (window) => window.Visible && window.Title === overlayWindowTitle('live-overlay-policy'),
    ));
  } finally {
    if (secondPid > 0) await stopOverlay({ id: 'live-overlay-policy', stateRoot }).catch(() => undefined);
    if (firstPid > 0 && firstPid !== secondPid) {
      await stopOverlay({ id: 'live-overlay-policy', stateRoot }).catch(() => undefined);
    }
    await rm(stateRoot, { recursive: true, force: true });
    livePid = 0;
  }
});

test('live overlays share visibility when a sibling owns focus', {
  skip: process.platform !== 'win32',
}, async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-window-overlay-siblings-live-'));
  let firstPid = 0;
  let secondPid = 0;
  try {
    const first = await startOverlay({
      id: 'visibility-sibling-first',
      stateRoot,
      visibilityPolicy: 'windows-terminal',
      refreshSeconds: 1,
      document: {
        title: 'Visibility sibling first',
        rows: [{ label: 'State', value: 'ready', tone: 'success' }],
      },
    });
    firstPid = first.pid ?? 0;
    assert.ok(firstPid > 0, 'first sibling must expose a host PID');
    await requestOverlayFocus('visibility-sibling-first', { stateRoot });
    await waitForSnapshot(firstPid, (snapshot) => snapshot.ForegroundPid === firstPid);

    const second = await startOverlay({
      id: 'visibility-sibling-second',
      stateRoot,
      visibilityPolicy: 'windows-terminal',
      refreshSeconds: 1,
      document: {
        title: 'Visibility sibling second',
        rows: [{ label: 'State', value: 'focused', tone: 'accent' }],
      },
    });
    secondPid = second.pid ?? 0;
    assert.ok(secondPid > 0, 'second sibling must expose a host PID');
    await requestOverlayFocus('visibility-sibling-second', { stateRoot });
    await waitForSnapshot(secondPid, (snapshot) => snapshot.ForegroundPid === secondPid);

    const firstVisible = await waitForSnapshot(firstPid, (snapshot) => snapshot.Windows.some(
      (window) => window.Visible && window.Title === overlayWindowTitle('visibility-sibling-first'),
    ));
    const secondVisible = await waitForSnapshot(secondPid, (snapshot) => snapshot.Windows.some(
      (window) => window.Visible && window.Title === overlayWindowTitle('visibility-sibling-second'),
    ));
    assert.ok(firstVisible.Windows.some(
      (window) => window.Visible && window.Title === overlayWindowTitle('visibility-sibling-first'),
    ));
    assert.ok(secondVisible.Windows.some(
      (window) => window.Visible && window.Title === overlayWindowTitle('visibility-sibling-second'),
    ));
  } finally {
    if (secondPid > 0) {
      await stopOverlay({ id: 'visibility-sibling-second', stateRoot }).catch(() => undefined);
    }
    if (firstPid > 0) {
      await stopOverlay({ id: 'visibility-sibling-first', stateRoot }).catch(() => undefined);
    }
    await rm(stateRoot, { recursive: true, force: true });
    livePid = 0;
  }
});

test('live focus requests are one-shot and do not keep stealing later operator focus', {
  skip: process.platform !== 'win32',
}, async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-window-overlay-focus-once-live-'));
  let overlayPid = 0;
  let inputSurfacePid = 0;
  try {
    const overlay = await startOverlay({
      id: 'focus-one-shot-overlay',
      stateRoot,
      visibilityPolicy: 'always',
      refreshSeconds: 1,
      document: {
        title: 'Focus one-shot overlay',
        rows: [{ label: 'State', value: 'running', tone: 'accent' }],
      },
    });
    overlayPid = overlay.pid ?? 0;
    assert.ok(overlayPid > 0, 'focus overlay must expose a host PID');
    await requestOverlayFocus('focus-one-shot-overlay', { stateRoot });
    await waitForSnapshot(overlayPid, (snapshot) => snapshot.ForegroundPid === overlayPid);

    const inputSurface = await startOverlay({
      id: 'focus-one-shot-input-surface',
      stateRoot,
      visibilityPolicy: 'always',
      refreshSeconds: 1,
      document: {
        title: 'Focus one-shot input surface',
        rows: [{ label: 'State', value: 'ready', tone: 'success' }],
      },
    });
    inputSurfacePid = inputSurface.pid ?? 0;
    assert.ok(inputSurfacePid > 0, 'input surface must expose a host PID');
    await requestOverlayFocus('focus-one-shot-input-surface', { stateRoot });
    await waitForSnapshot(inputSurfacePid, (snapshot) => snapshot.ForegroundPid === inputSurfacePid);

    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const stable = readNativeWindowSnapshot(inputSurfacePid);
    assert.ok(stable, 'input surface must remain probeable after multiple focus timer cycles');
    assert.equal(
      stable.ForegroundPid,
      inputSurfacePid,
      'a consumed focus request must not keep stealing focus from the later operator surface',
    );
  } finally {
    if (inputSurfacePid > 0) {
      await stopOverlay({ id: 'focus-one-shot-input-surface', stateRoot }).catch(() => undefined);
    }
    if (overlayPid > 0) {
      await stopOverlay({ id: 'focus-one-shot-overlay', stateRoot }).catch(() => undefined);
    }
    await rm(stateRoot, { recursive: true, force: true });
    livePid = 0;
  }
});

test('live overlay launch preserves an existing operator input surface focus', {
  skip: process.platform !== 'win32',
}, async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'narada-window-overlay-focus-live-'));
  let inputSurfacePid = 0;
  let overlayPid = 0;
  try {
    const inputSurface = await startOverlay({
      id: 'operator-input-surface',
      stateRoot,
      visibilityPolicy: 'always',
      refreshSeconds: 1,
      document: {
        title: 'Operator input surface',
        rows: [{ label: 'State', value: 'ready', tone: 'success' }],
      },
    });
    inputSurfacePid = inputSurface.pid ?? 0;
    assert.ok(inputSurfacePid > 0, 'input surface must expose a host PID');
    await requestOverlayFocus('operator-input-surface', { stateRoot });
    await waitForSnapshot(inputSurfacePid, (snapshot) => snapshot.ForegroundPid === inputSurfacePid);

    const overlay = await startOverlay({
      id: 'operator-console-overlay',
      stateRoot,
      visibilityPolicy: 'always',
      refreshSeconds: 1,
      document: {
        title: 'Operator console overlay',
        rows: [{ label: 'State', value: 'running', tone: 'accent' }],
      },
    });
    overlayPid = overlay.pid ?? 0;
    assert.ok(overlayPid > 0, 'overlay must expose a host PID');

    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const afterOverlayLaunch = readNativeWindowSnapshot(inputSurfacePid);
    assert.ok(afterOverlayLaunch, 'input surface must remain probeable after overlay launch');
    assert.equal(
      afterOverlayLaunch.ForegroundPid,
      inputSurfacePid,
      'launching an overlay must not steal focus from the existing operator input surface',
    );
  } finally {
    if (overlayPid > 0) {
      await stopOverlay({ id: 'operator-console-overlay', stateRoot }).catch(() => undefined);
    }
    if (inputSurfacePid > 0) {
      await stopOverlay({ id: 'operator-input-surface', stateRoot }).catch(() => undefined);
    }
    await rm(stateRoot, { recursive: true, force: true });
    livePid = 0;
  }
});
