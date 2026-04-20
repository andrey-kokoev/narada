import { describe, expect, it } from 'vitest';
import { verifyRunCommand } from '../../src/commands/verify-run.js';

describe('verify-run command', () => {
  it('returns error when no command provided', async () => {
    const result = await verifyRunCommand(
      {},
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(1);
    expect((result.result as any).status).toBe('error');
  });

  it('rejects full-suite by default', async () => {
    const result = await verifyRunCommand(
      { cmd: 'pnpm test:full' },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(1);
    const data = result.result as any;
    expect(data.status).toBe('error');
    expect(data.scope).toBe('full-suite');
  });

  it('allows verify command', async () => {
    const result = await verifyRunCommand(
      { cmd: 'pnpm verify' },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    // It will try to run pnpm verify, which may fail in test environment,
    // but the policy gate should allow it
    expect((result.result as any).scope).toBe('verify');
  });
});
