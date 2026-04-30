import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteInboxStore } from '@narada2/control-plane';
import { operatorStartCommand } from '../../src/commands/operator.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function writeConfig(siteRoot: string): void {
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  writeFileSync(join(siteRoot, 'config.json'), JSON.stringify({ site_id: 'test-site' }, null, 2));
}

function writeIdentity(siteRoot: string, options: { capabilities?: string[]; submitStrategy?: string } = {}): void {
  mkdirSync(join(siteRoot, 'operator-surfaces'), { recursive: true });
  writeFileSync(join(siteRoot, 'operator-surfaces', 'identities.json'), JSON.stringify({
    schema: 'https://narada.dev/schemas/operator-surface-identities/v1',
    updated_at: '2026-01-01T00:00:00Z',
    identities: [
      {
        identity_id: 'test-site-architect',
        site_id: 'test-site',
        role: 'architect',
        agent_kind: 'codex_cli',
        label: 'test-site-architect',
        input_capabilities: options.capabilities ?? ['focus', 'type_text'],
        ...(options.submitStrategy === undefined ? { submit_strategy: 'type_only' } : options.submitStrategy ? { submit_strategy: options.submitStrategy } : {}),
        admitted_by: 'operator',
        admitted_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        authority_limits: ['surface_does_not_grant_effect_capability'],
      },
    ],
  }, null, 2));
}

function insertInbox(siteRoot: string): void {
  const store = new SqliteInboxStore(join(siteRoot, '.ai', 'inbox.db'));
  try {
    store.insert({
      envelope_id: 'env_test',
      received_at: '2026-01-01T00:00:00Z',
      source: { kind: 'user_chat', ref: 'test' },
      kind: 'observation',
      authority: { level: 'operator_confirmed', principal: 'operator' },
      payload: { title: 'Pending work' },
    });
  } finally {
    store.close();
  }
}

describe('operator start command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-operator-start-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports missing Site without mutation', async () => {
    const missing = join(tempDir, 'missing-site');

    const result = await operatorStartCommand({ site: missing, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'site_absent',
      mutation_performed: false,
      command_authority: { read_only: true, mutates_site_state: false },
    });
  });

  it('reports initialized but unready Site', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);

    const result = await operatorStartCommand({ site, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'initialized_unready',
      next_command: expect.stringContaining('sites doctor'),
    });
  });

  it('reports ready Site with missing role binding', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site);

    const result = await operatorStartCommand({ site, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'ready_missing_role_binding',
      role_binding: { role: 'architect', identity_id: null },
      next_command: expect.stringContaining('operator-surface agent instantiate'),
    });
  });

  it('reports missing transport when role exists without input posture', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site);
    writeIdentity(site, { capabilities: [], submitStrategy: '' });

    const result = await operatorStartCommand({ site, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'ready_missing_transport',
      next_command: 'narada operator-surface bind-focused --as self',
    });
  });

  it('reports pending inbox before fully idle', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site);
    writeIdentity(site);
    insertInbox(site);

    const result = await operatorStartCommand({ site, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'ready_pending_inbox',
      pending_inbox: [expect.objectContaining({ envelope_id: 'env_test', title: 'Pending work' })],
      mutation_performed: false,
    });
  });

  it('reports fully idle ready Site with stable JSON shape', async () => {
    const site = join(tempDir, 'site');
    mkdirSync(site);
    writeConfig(site);
    writeIdentity(site);

    const result = await operatorStartCommand({ site, role: 'architect', operation: 'op-1', execute: true, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      posture: 'fully_idle',
      target_locus: { operation: 'op-1' },
      command_authority: {
        read_only: true,
        execute_requested: true,
        execute_supported: false,
      },
      mutation_performed: false,
      bounded_output: true,
    });
  });
});
