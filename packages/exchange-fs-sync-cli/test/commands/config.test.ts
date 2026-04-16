import { describe, expect, it, vi } from 'vitest';
import { configCommand } from '../../src/commands/config.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { vol } from 'memfs';
import type { CommandContext } from '../../src/lib/command-wrapper.js';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
}

function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    configPath: '/test/config.json',
    logger: createMockLogger(),
    verbose: false,
    ...overrides,
  };
}

describe('config command', () => {
  it('creates default config file', async () => {
    vol.fromJSON({});

    const context = createMockContext();
    const result = await configCommand({ output: '/test/output.json' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify file was created
    const configContent = vol.readFileSync('/test/output.json', 'utf8');
    const config = JSON.parse(configContent);

    expect(config.mailbox_id).toBe('user@example.com');
    expect(config.root_dir).toBe('./data');
    expect(config.scopes[0].scope_id).toBe('user@example.com');
    expect(config.scopes[0].sources[0].user_id).toBe('user@example.com');
    expect(config.scopes[0].sources[0].prefer_immutable_ids).toBe(true);
    expect(config.scopes[0].scope.included_container_refs).toContain('inbox');
  });

  it('overwrites existing file with force flag', async () => {
    vol.fromJSON({
      '/test/output.json': JSON.stringify({ existing: true }),
    });

    const context = createMockContext();
    const result = await configCommand({ output: '/test/output.json', force: true }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const configContent = vol.readFileSync('/test/output.json', 'utf8');
    const config = JSON.parse(configContent);
    expect(config.existing).toBeUndefined();
    expect(config.mailbox_id).toBeDefined();
  });

  it('fails when file exists without force flag', async () => {
    vol.fromJSON({
      '/test/output.json': JSON.stringify({ existing: true }),
    });

    const context = createMockContext();
    const result = await configCommand({ output: '/test/output.json', force: false }, context);

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
    });
  });

  it('creates nested directories for output path', async () => {
    vol.fromJSON({});

    const context = createMockContext();
    const result = await configCommand({ output: '/test/nested/deep/config.json' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const configContent = vol.readFileSync('/test/nested/deep/config.json', 'utf8');
    const config = JSON.parse(configContent);
    expect(config.mailbox_id).toBeDefined();
  });

  it('respects format option for human output', async () => {
    vol.fromJSON({});

    const logger = createMockLogger();
    const context = createMockContext({ logger });
    const result = await configCommand({ output: '/test/config.json', format: 'human' }, context);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // In human mode, should log info messages
    expect(logger.info).toHaveBeenCalled();
  });
});
