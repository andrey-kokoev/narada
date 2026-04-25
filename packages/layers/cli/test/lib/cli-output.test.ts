import { describe, expect, it } from 'vitest';
import {
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
});
