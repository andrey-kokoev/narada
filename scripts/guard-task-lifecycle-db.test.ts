import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { guardTaskLifecycleDb } from './guard-task-lifecycle-db.ts';

type RunnerOptions = {
  snapshotTracked?: boolean;
  dbTracked?: boolean;
  dbIgnored?: boolean;
  exportedSnapshot?: string;
  naradaUnavailable?: boolean;
  calls?: Array<{ command: string; args: string[] }>;
};

function fixture({
  db = false,
  snapshot = '{"tasks":[]}\n',
}: { db?: boolean; snapshot?: string | null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'narada-task-db-guard-'));
  mkdirSync(join(root, '.ai'), { recursive: true });
  if (snapshot !== null) writeFileSync(join(root, '.ai', 'task-lifecycle-snapshot.json'), snapshot, 'utf8');
  if (db) writeFileSync(join(root, '.ai', 'task-lifecycle.db'), 'sqlite-placeholder', 'utf8');
  mkdirSync(join(root, 'packages', 'layers', 'cli', 'dist'), { recursive: true });
  writeFileSync(join(root, 'packages', 'layers', 'cli', 'dist', 'main.js'), '', 'utf8');
  return root;
}

function runner({
  snapshotTracked = true,
  dbTracked = false,
  dbIgnored = true,
  exportedSnapshot = '{"tasks":[]}\n',
  naradaUnavailable = false,
  calls = [],
}: RunnerOptions = {}) {
  return (command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === 'test-git') {
      if (args[0] === 'check-ignore') return { status: dbIgnored ? 0 : 1 };
      const path = args.at(-1);
      if (path === '.ai/task-lifecycle-snapshot.json') return { status: snapshotTracked ? 0 : 1 };
      if (path === '.ai/task-lifecycle.db') return { status: dbTracked ? 0 : 1 };
    }
    if (naradaUnavailable) return { status: null, error: new Error('ENOENT') };
    const outputIndex = args.indexOf('--output');
    assert.notEqual(outputIndex, -1);
    writeFileSync(args[outputIndex + 1]!, exportedSnapshot, 'utf8');
    return { status: 0 };
  };
}

const guardOptions = (root: string, runCommand: ReturnType<typeof runner>) => ({
  root,
  runCommand,
  env: { NARADA_GIT_BINARY: 'test-git' },
  platform: 'win32' as const,
});

test('reports missing and untracked snapshots with the original exit code', () => {
  const missingRoot = fixture({ snapshot: null });
  const untrackedRoot = fixture();
  try {
    const missing = guardTaskLifecycleDb(guardOptions(missingRoot, runner()));
    const untracked = guardTaskLifecycleDb(guardOptions(untrackedRoot, runner({ snapshotTracked: false })));
    assert.equal(missing.exitCode, 1);
    assert.match(missing.stderr[0]!, /snapshot missing/);
    assert.equal(untracked.exitCode, 1);
    assert.match(untracked.stderr[0]!, /snapshot is not tracked/);
  } finally {
    rmSync(missingRoot, { recursive: true, force: true });
    rmSync(untrackedRoot, { recursive: true, force: true });
  }
});

test('rejects tracked or unignored database paths', () => {
  const root = fixture();
  try {
    const tracked = guardTaskLifecycleDb(guardOptions(root, runner({ dbTracked: true })));
    const unignored = guardTaskLifecycleDb(guardOptions(root, runner({ dbIgnored: false })));
    assert.equal(tracked.exitCode, 2);
    assert.match(tracked.stderr[0]!, /DB is still tracked/);
    assert.equal(unignored.exitCode, 2);
    assert.match(unignored.stderr[0]!, /DB is not ignored/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts a tracked snapshot when the ignored local database is absent', () => {
  const root = fixture();
  try {
    const outcome = guardTaskLifecycleDb(guardOptions(root, runner()));
    assert.equal(outcome.exitCode, 0);
    assert.match(outcome.stdout[1]!, /reconstruct with/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exports through the built workspace CLI and compares snapshot freshness', () => {
  const root = fixture({ db: true });
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    const fresh = guardTaskLifecycleDb(guardOptions(root, runner({ calls })));
    const stale = guardTaskLifecycleDb(guardOptions(root, runner({ exportedSnapshot: '{"tasks":[1]}\n' })));
    assert.equal(fresh.exitCode, 0);
    assert.match(fresh.stdout[0]!, /tracked fresh snapshot/);
    assert.equal(stale.exitCode, 2);
    assert.match(stale.stderr[0]!, /snapshot is stale/);
    const exportCall = calls.find(({ args }) => args.includes('export'));
    assert.equal(exportCall?.command, process.execPath);
    assert.match(exportCall?.args[0] ?? '', /packages[\\/]layers[\\/]cli[\\/]dist[\\/]main\.js$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports an unavailable Narada command without leaking temporary files', () => {
  const root = fixture({ db: true });
  try {
    const outcome = guardTaskLifecycleDb(guardOptions(root, runner({ naradaUnavailable: true })));
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stderr[0]!, /narada command unavailable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
