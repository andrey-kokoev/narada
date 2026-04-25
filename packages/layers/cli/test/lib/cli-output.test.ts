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

  it('global json overrides local default human format', () => {
    expect(resolveCommandFormat('human', 'human', 'json')).toBe('json');
  });
});
