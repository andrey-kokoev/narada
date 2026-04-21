import { describe, expect, it, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { acknowledgeAlertCommand } from '../../src/commands/acknowledge-alert.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';

const mocks = vi.hoisted(() => {
  const db = { close: vi.fn() };
  const coordinatorStore = { getWorkItem: vi.fn() };
  const outboundStore = {};
  const intentStore = {};
  return {
    db,
    coordinatorStore,
    outboundStore,
    intentStore,
    executeOperatorAction: vi.fn(),
  };
});

vi.mock('@narada2/control-plane', () => ({
  isMultiMailboxConfig: vi.fn(() => false),
  loadConfig: vi.fn(async () => ({
    scopes: [{ scope_id: 'test-scope', root_dir: '/test/data' }],
  })),
  loadMultiMailboxConfig: vi.fn(),
  Database: vi.fn(() => mocks.db),
  SqliteCoordinatorStore: vi.fn(() => mocks.coordinatorStore),
  SqliteOutboundStore: vi.fn(() => mocks.outboundStore),
  SqliteIntentStore: vi.fn(() => mocks.intentStore),
  executeOperatorAction: mocks.executeOperatorAction,
}));

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

describe('acknowledge-alert command', () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync('/test', { recursive: true });
    vol.writeFileSync('/test/config.json', JSON.stringify({ scopes: [] }));
    vi.clearAllMocks();
    mocks.coordinatorStore.getWorkItem.mockReturnValue({
      work_item_id: 'wi-1',
      status: 'failed_terminal',
    });
    mocks.executeOperatorAction.mockResolvedValue({ status: 'executed' });
  });

  it('routes failed work item acknowledgement through the audited operator executor', async () => {
    const result = await acknowledgeAlertCommand(
      { workItemId: 'wi-1' },
      createMockContext(),
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      work_item_id: 'wi-1',
      action: 'acknowledge_alert',
    });
    expect(mocks.executeOperatorAction).toHaveBeenCalledWith(
      {
        scope_id: 'test-scope',
        coordinatorStore: mocks.coordinatorStore,
        outboundStore: mocks.outboundStore,
        intentStore: mocks.intentStore,
      },
      {
        action_type: 'acknowledge_alert',
        target_id: 'wi-1',
      },
    );
  });

  it('returns executor rejection reason', async () => {
    mocks.executeOperatorAction.mockResolvedValue({
      status: 'rejected',
      reason: 'Work item wi-1 is not in a failed status',
    });

    const result = await acknowledgeAlertCommand(
      { workItemId: 'wi-1' },
      createMockContext(),
    );

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'Work item wi-1 is not in a failed status',
    });
  });

  it('returns not found when work item is absent from all operations', async () => {
    mocks.coordinatorStore.getWorkItem.mockReturnValue(undefined);

    const result = await acknowledgeAlertCommand(
      { workItemId: 'missing' },
      createMockContext(),
    );

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'Work item missing not found in any operation',
    });
    expect(mocks.executeOperatorAction).not.toHaveBeenCalled();
  });
});
