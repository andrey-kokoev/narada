import { describe, expect, it } from 'vitest';
import {
  parseSqliteBackendPreference,
  selectSqliteRuntime,
} from '../../src/sqlite-runtime.js';

describe('sqlite runtime posture', () => {
  it('defaults to node:sqlite in auto mode on Node 22+', () => {
    const posture = selectSqliteRuntime({
      preference: 'auto',
      nodeVersion: '22.16.0',
      bunVersion: null,
      bunSqliteAvailable: false,
      nodeSqliteAvailable: true,
      betterSqlite3Available: true,
    });

    expect(posture.selected).toBe('node:sqlite');
    expect(posture.supported).toBe(true);
    expect(posture.reason).toContain('auto selects node:sqlite');
  });

  it('keeps auto mode supported when node:sqlite is absent but better-sqlite3 is available', () => {
    const posture = selectSqliteRuntime({
      preference: 'auto',
      nodeVersion: '20.20.2',
      bunVersion: null,
      bunSqliteAvailable: false,
      nodeSqliteAvailable: false,
      betterSqlite3Available: true,
    });

    expect(posture.selected).toBe('better-sqlite3');
    expect(posture.supported).toBe(true);
    expect(posture.reason).toContain('node:sqlite is not available');
  });

  it('defaults to bun:sqlite when Bun is available', () => {
    const posture = selectSqliteRuntime({
      preference: 'auto',
      nodeVersion: '22.16.0',
      bunVersion: '1.3.0',
      bunSqliteAvailable: true,
      nodeSqliteAvailable: true,
      betterSqlite3Available: true,
    });

    expect(posture.selected).toBe('bun:sqlite');
    expect(posture.supported).toBe(true);
    expect(posture.reason).toContain('auto selects bun:sqlite');
  });

  it('supports explicit node:sqlite on Node 22+', () => {
    const posture = selectSqliteRuntime({
      preference: 'node:sqlite',
      nodeVersion: '22.16.0',
      bunVersion: null,
      bunSqliteAvailable: false,
      nodeSqliteAvailable: true,
      betterSqlite3Available: true,
    });

    expect(posture.selected).toBe('node:sqlite');
    expect(posture.supported).toBe(true);
    expect(posture.reason).toContain('authoritative');
  });

  it('rejects invalid backend preference values', () => {
    expect(() => parseSqliteBackendPreference('sqlite')).toThrow('NARADA_SQLITE_BACKEND');
  });
});
