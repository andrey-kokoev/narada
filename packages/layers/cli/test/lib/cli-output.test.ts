import { describe, expect, it } from 'vitest';
import {
  emitCliOutputAdmission,
  emitCommandResult,
  emitFiniteCommandFailure,
  emitFiniteCommandDiagnostics,
  emitFiniteCommandResult,
  emitFormatterBackedCommandResult,
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

  it('routes emitCommandResult through stdout admission', () => {
    const stdout: string[] = [];
    const originalLog = console.log;
    console.log = (line?: unknown) => {
      stdout.push(String(line));
    };
    try {
      emitCommandResult({ status: 'ok' }, 'json');
    } finally {
      console.log = originalLog;
    }
    expect(JSON.parse(stdout[0] ?? '{}')).toEqual({ status: 'ok' });
  });

  it('routes finite failure through stderr and finite exit admission', () => {
    const stderr: string[] = [];
    const originalError = console.error;
    console.error = (line?: unknown) => {
      stderr.push(String(line));
    };
    try {
      expect(() =>
        emitFiniteCommandFailure('failed before envelope', {
          exitCode: 7,
          exit: (code): never => {
            throw new Error(`exit:${code}`);
          },
        }),
      ).toThrow('exit:7');
    } finally {
      console.error = originalError;
    }
    expect(stderr).toEqual(['failed before envelope']);
  });

  it('routes finite command result failure through finite exit admission', () => {
    const stdout: string[] = [];
    const originalLog = console.log;
    console.log = (line?: unknown) => {
      stdout.push(String(line));
    };
    try {
      expect(() =>
        emitFiniteCommandResult(
          { exitCode: 9, result: { status: 'failed' } },
          {
            format: 'json',
            exit: (code): never => {
              throw new Error(`exit:${code}`);
            },
          },
        ),
      ).toThrow('exit:9');
    } finally {
      console.log = originalLog;
    }
    expect(JSON.parse(stdout[0] ?? '{}')).toEqual({ status: 'failed' });
  });

  it('routes formatter-backed stdout and stderr through admission', () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (line?: unknown) => {
      stdout.push(String(line));
    };
    console.error = (line?: unknown) => {
      stderr.push(String(line));
    };
    try {
      emitFormatterBackedCommandResult(
        { exitCode: 0, result: { status: 'ok', _formatted: 'human ok' } },
        { format: 'human' },
      );
      expect(() =>
        emitFormatterBackedCommandResult(
          { exitCode: 5, result: { error: 'human failed' } },
          {
            format: 'human',
            exit: (code): never => {
              throw new Error(`exit:${code}`);
            },
          },
        ),
      ).toThrow('exit:5');
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    expect(stdout).toEqual(['human ok']);
    expect(stderr).toEqual(['human failed']);
  });
});
