import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  outboxApproveCommand,
  outboxArchiveCommand,
  outboxComposeCommand,
  outboxConfirmCommand,
  outboxExportCommand,
  outboxListCommand,
  outboxPreviewCommand,
  outboxSupersedeCommand,
} from '../../src/commands/outbox.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';

function createMockContext(): CommandContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
  return {
    configPath: '/test/config.json',
    logger: logger as unknown as CommandContext['logger'],
    verbose: false,
  };
}

const tempDirs: string[] = [];

async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'narada-outbox-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('canonical outbox', () => {
  it('composes, previews, approves, confirms, and exports an inert outbox item', async () => {
    const cwd = await tempRepo();
    const compose = await outboxComposeCommand({
      cwd,
      targetKind: 'site_inbox',
      targetRef: 'client-site',
      transport: 'filesystem_drop',
      payloadBody: 'hello client-site',
      authorityLevel: 'operator_confirmed',
      principal: 'andrey',
      routeId: 'route_123',
      capabilityGrantId: 'cap_123',
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect(compose.exitCode).toBe(ExitCode.SUCCESS);
    const item = (compose.result as { item: { outbox_id: string; status: string; dry_run_rendering: string }; external_mutation_performed: boolean }).item;
    expect(item.status).toBe('composed');
    expect(item.dry_run_rendering).toContain('filesystem_drop');
    expect((compose.result as { external_mutation_performed: boolean }).external_mutation_performed).toBe(false);
    expect(existsSync(join(cwd, '.ai', 'canonical-outbox.json'))).toBe(true);

    const preview = await outboxPreviewCommand({ cwd, outboxId: item.outbox_id, format: 'json' }, createMockContext());
    expect((preview.result as { rendering: string }).rendering).toContain('hello client-site');

    const approve = await outboxApproveCommand({ cwd, outboxId: item.outbox_id, by: 'operator', format: 'json' }, createMockContext());
    expect((approve.result as { item: { status: string; approved_by: string } }).item.status).toBe('approved');

    const confirm = await outboxConfirmCommand({
      cwd,
      outboxId: item.outbox_id,
      by: 'operator',
      evidenceRef: 'exec:filedrop:1',
      confirmationRef: 'file:/tmp/drop/001.json',
      format: 'json',
    }, createMockContext());
    expect((confirm.result as { item: { status: string; delivery_confirmation_ref: string } }).item.status).toBe('confirmed');
    expect((confirm.result as { item: { delivery_confirmation_ref: string } }).item.delivery_confirmation_ref).toBe('file:/tmp/drop/001.json');

    const exported = await outboxExportCommand({ cwd, format: 'json' }, createMockContext());
    expect((exported.result as { count: number }).count).toBe(1);
    expect(existsSync(join(cwd, '.ai', 'outbox-items'))).toBe(true);
  });

  it('lists and archives outbox items', async () => {
    const cwd = await tempRepo();
    const compose = await outboxComposeCommand({
      cwd,
      targetKind: 'human_notification',
      targetRef: 'operator',
      transport: 'console',
      payloadBody: 'notice',
      by: 'system',
      format: 'json',
    }, createMockContext());
    const outboxId = (compose.result as { item: { outbox_id: string } }).item.outbox_id;

    const list = await outboxListCommand({ cwd, status: 'composed', format: 'json' }, createMockContext());
    expect((list.result as { count: number }).count).toBe(1);

    const archive = await outboxArchiveCommand({ cwd, outboxId, by: 'operator', reason: 'not needed', format: 'json' }, createMockContext());
    expect((archive.result as { item: { status: string; archive_reason: string } }).item.status).toBe('archived');
    expect((archive.result as { item: { archive_reason: string } }).item.archive_reason).toBe('not needed');
  });

  it('records supersession links', async () => {
    const cwd = await tempRepo();
    const first = await outboxComposeCommand({
      cwd,
      targetKind: 'site_inbox',
      targetRef: 'client-site',
      transport: 'filesystem_drop',
      payloadBody: 'old',
      by: 'operator',
      format: 'json',
    }, createMockContext());
    const second = await outboxComposeCommand({
      cwd,
      targetKind: 'site_inbox',
      targetRef: 'client-site',
      transport: 'filesystem_drop',
      payloadBody: 'new',
      supersedes: (first.result as { item: { outbox_id: string } }).item.outbox_id,
      by: 'operator',
      format: 'json',
    }, createMockContext());
    const supersede = await outboxSupersedeCommand({
      cwd,
      outboxId: (first.result as { item: { outbox_id: string } }).item.outbox_id,
      supersededBy: (second.result as { item: { outbox_id: string } }).item.outbox_id,
      by: 'operator',
      format: 'json',
    }, createMockContext());

    expect((supersede.result as { item: { status: string; superseded_by: string } }).item.status).toBe('superseded');
    expect((supersede.result as { item: { superseded_by: string } }).item.superseded_by).toBe((second.result as { item: { outbox_id: string } }).item.outbox_id);
  });
});
