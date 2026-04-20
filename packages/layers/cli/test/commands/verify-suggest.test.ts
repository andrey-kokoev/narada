import { describe, expect, it } from 'vitest';
import { verifySuggestCommand } from '../../src/commands/verify-suggest.js';

describe('verify-suggest command', () => {
  it('returns error when no files provided', async () => {
    const result = await verifySuggestCommand(
      {},
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(1);
    expect((result.result as any).status).toBe('error');
  });

  it('suggests verify for docs files', async () => {
    const result = await verifySuggestCommand(
      { files: ['docs/system.md'] },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(0);
    const data = result.result as any;
    expect(data.suggestion.command).toBe('pnpm verify');
    expect(data.suggestion.scope).toBe('verify');
    expect(data.suggestion.policy.allowed).toBe(true);
  });

  it('handles comma-separated file list', async () => {
    const result = await verifySuggestCommand(
      { files: ['docs/a.md,docs/b.md'] },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(0);
    const data = result.result as any;
    expect(data.suggestion.command).toBe('pnpm verify');
  });
});
