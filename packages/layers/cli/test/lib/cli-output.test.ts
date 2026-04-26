import { describe, expect, it } from 'vitest';
import {
  emitCliOutputAdmission,
  emitFiniteCommandDiagnostics,
  exitCliOutputAdmission,
  exitInteractiveCommandSuccessfully,
  exitLongLivedCommandSuccessfully,
  formatCommandResultForStdout,
  resolveCommandFormat,
} from '../../src/lib/cli-output.js';

describe('CLI output admission', () => {
  it('formats objects as parseable JSON when local format is json', () => {
    const stdout = formatCommandResultForStdout({ status: 'success', task_number: 658 }, 'json', 'human');
    expect(JSON.parse(stdout)).toEqual({ status: 'success', task_number: 658 });
    expect(stdout).not.toContain('[object Object]');
  });

  it('formats objects as parseable JSON when global format is json', () => {
    const stdout = formatCommandResultForStdout({ status: 'success', task_number: 658 }, 'human', 'json');
    expect(JSON.parse(stdout)).toEqual({ status: 'success', task_number: 658 });
    expect(stdout).not.toContain('[object Object]');
  });

  it('formats admitted human objects through _formatted text', () => {
    const stdout = formatCommandResultForStdout(
      { status: 'success', _formatted: 'Range 724-726 complete (3 tasks checked)' },
      'human',
      'human',
    );
    expect(stdout).toBe('Range 724-726 complete (3 tasks checked)');
    expect(stdout).not.toContain('[object Object]');
  });

  it('formats unadmitted human objects as JSON instead of JavaScript object strings', () => {
    const stdout = formatCommandResultForStdout({ status: 'success', task_number: 727 }, 'human', 'human');
    expect(JSON.parse(stdout)).toEqual({ status: 'success', task_number: 727 });
    expect(stdout).not.toContain('[object Object]');
  });

  it('global json overrides local default human format', () => {
    expect(resolveCommandFormat('human', 'human', 'json')).toBe('json');
  });

  it('admits stdout lines through an explicit zone and stream', () => {
    const stdout: string[] = [];
    emitCliOutputAdmission({
      zone: 'finite',
      stream: 'stdout',
      lines: ['line 1', 'line 2'],
      stdout: (line) => stdout.push(line),
    });
    expect(stdout).toEqual(['line 1', 'line 2']);
  });

  it('admits stderr diagnostics through the finite diagnostic helper', () => {
    const stderr: string[] = [];
    const originalError = console.error;
    console.error = (line?: unknown) => {
      stderr.push(String(line));
    };
    try {
      emitFiniteCommandDiagnostics(['FAIL validation', '  missing file']);
    } finally {
      console.error = originalError;
    }
    expect(stderr).toEqual(['FAIL validation', '  missing file']);
  });

  it('admits successful exits through explicit exit zones', () => {
    const exits: Array<{ zone: string; code: number }> = [];
    const makeExit = (zone: string) => (code: number): never => {
      exits.push({ zone, code });
      throw new Error(`exit:${zone}:${code}`);
    };

    expect(() => exitCliOutputAdmission({ zone: 'long_lived', exit: makeExit('generic') })).toThrow('exit:generic:0');
    expect(() => exitLongLivedCommandSuccessfully(makeExit('long_lived'))).toThrow('exit:long_lived:0');
    expect(() => exitInteractiveCommandSuccessfully(makeExit('interactive'))).toThrow('exit:interactive:0');
    expect(exits).toEqual([
      { zone: 'generic', code: 0 },
      { zone: 'long_lived', code: 0 },
      { zone: 'interactive', code: 0 },
    ]);
  });
});
