import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');
vi.unmock('node:child_process');

import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteInboxStore } from '@narada2/control-plane';
import {
  inboxClaimCommand,
  inboxDoctorCommand,
  inboxExportCommand,
  inboxImportCommand,
  inboxListCommand,
  inboxNextCommand,
  inboxPendingCommand,
  inboxPromoteCommand,
  inboxReleaseCommand,
  inboxShowCommand,
  inboxSubmitCommand,
  inboxTaskCommand,
  inboxTriageCommand,
  inboxWorkNextCommand,
} from '../../src/commands/inbox.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('Canonical Inbox CLI commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-inbox-cli-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('submits, lists, shows, and promotes an envelope', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'diagnostic',
      sourceRef: 'site-doctor:desktop-sunroom-2',
      kind: 'observation',
      authorityLevel: 'system_observed',
      payload: JSON.stringify({ hostname: 'desktop-sunroom-2', computer_name: 'DESKTOP-SUNROOM' }),
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const envelope = (submitted.result as { envelope: { envelope_id: string; payload: unknown } }).envelope;
    expect(envelope.envelope_id).toMatch(/^env_/);

    const listed = await inboxListCommand({ cwd: tempDir, format: 'json', limit: 10 });
    expect(listed.exitCode).toBe(ExitCode.SUCCESS);
    expect((listed.result as { count: number }).count).toBe(1);

    const shown = await inboxShowCommand({ cwd: tempDir, format: 'json', envelopeId: envelope.envelope_id });
    expect(shown.exitCode).toBe(ExitCode.SUCCESS);
    expect((shown.result as { envelope: { payload: unknown } }).envelope.payload).toEqual(envelope.payload);

    const promoted = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'decision',
      targetRef: 'decision:pc-site-identity-policy',
      by: 'operator',
    });
    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const promotedEnvelope = (promoted.result as { envelope: Record<string, unknown> }).envelope;
    expect(promotedEnvelope.status).toBe('promoted');
    expect((promoted.result as { enactment_status: string }).enactment_status).toBe('pending');
    expect(promotedEnvelope.payload).toEqual(envelope.payload);
    expect(promotedEnvelope.source).toEqual(
      expect.objectContaining({ kind: 'diagnostic', ref: 'site-doctor:desktop-sunroom-2' }),
    );
  });

  it('submits payload from file for shell-safe ingestion', async () => {
    const payloadPath = join(tempDir, 'payload.json');
    writeFileSync(payloadPath, JSON.stringify({ title: 'From file', nested: { ok: true } }));

    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:file',
      kind: 'proposal',
      authorityLevel: 'operator_confirmed',
      payloadFile: payloadPath,
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const envelope = (submitted.result as { envelope: { payload: unknown } }).envelope;
    expect(envelope.payload).toEqual({ title: 'From file', nested: { ok: true } });
  });

  it('submits payload from stdin for pipe-safe ingestion', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:stdin',
      kind: 'proposal',
      authorityLevel: 'operator_confirmed',
      payloadStdin: true,
      stdin: Readable.from([JSON.stringify({ title: 'From stdin' })]),
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const envelope = (submitted.result as { envelope: { payload: unknown } }).envelope;
    expect(envelope.payload).toEqual({ title: 'From stdin' });
  });

  it('includes delivery coordinates in submit results', async () => {
    setupGitRepo(tempDir);

    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:delivery',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Delivery coordinates' }),
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const result = submitted.result as {
      envelope: { envelope_id: string };
      delivery: Record<string, unknown>;
    };
    expect(result.delivery).toMatchObject({
      repo_root: tempDir,
      branch: 'main',
      inbox_db_path: join(tempDir, '.ai', 'inbox.db'),
    });
    expect(result.delivery.head_commit).toEqual(expect.any(String));
    expect(result.delivery).toHaveProperty('head_matches_remote');
  });

  it('doctors inbox delivery and local readiness without mutating envelopes', async () => {
    setupGitRepo(tempDir);
    const before = await inboxListCommand({ cwd: tempDir, format: 'json' });

    const doctor = await inboxDoctorCommand({ cwd: tempDir, format: 'json' });

    expect(doctor.exitCode).toBe(ExitCode.SUCCESS);
    const result = doctor.result as {
      ready: boolean;
      delivery: Record<string, unknown>;
      checks: Array<{ name: string; ok: boolean }>;
    };
    expect(result.delivery).toMatchObject({ repo_root: tempDir, branch: 'main' });
    expect(result.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      'repo_detected',
      'inbox_db_accessible',
      'sqlite_binding_loaded',
      'cli_build_present',
    ]));
    const after = await inboxListCommand({ cwd: tempDir, format: 'json' });
    expect((after.result as { count: number }).count).toBe((before.result as { count: number }).count);
  });

  it('exports and imports inbox envelopes idempotently through append-only artifacts', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:portable',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Portable envelope' }),
    });
    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);

    const exportDir = join(tempDir, 'exports');
    const exported = await inboxExportCommand({
      cwd: tempDir,
      format: 'json',
      outDir: exportDir,
    });
    expect(exported.exitCode).toBe(ExitCode.SUCCESS);
    expect((exported.result as { count: number }).count).toBe(1);
    expect(readdirSync(exportDir).filter((name) => name.endsWith('.json'))).toHaveLength(1);

    const importedDir = mkdtempSync(join(tmpdir(), 'narada-inbox-import-'));
    try {
      const imported = await inboxImportCommand({
        cwd: importedDir,
        format: 'json',
        fromDir: exportDir,
      });
      expect(imported.exitCode).toBe(ExitCode.SUCCESS);
      expect(imported.result).toMatchObject({ imported: 1, skipped: 0 });

      const repeated = await inboxImportCommand({
        cwd: importedDir,
        format: 'json',
        fromDir: exportDir,
      });
      expect(repeated.exitCode).toBe(ExitCode.SUCCESS);
      expect(repeated.result).toMatchObject({ imported: 0, skipped: 1 });
    } finally {
      rmSync(importedDir, { recursive: true, force: true });
    }
  });

  it('reports conflict-safe local DB posture in doctor delivery coordinates', async () => {
    setupGitRepo(tempDir);
    const doctor = await inboxDoctorCommand({ cwd: tempDir, format: 'json' });
    const delivery = (doctor.result as { delivery: Record<string, unknown> }).delivery;
    expect(delivery).toMatchObject({
      export_dir: join(tempDir, '.ai', 'inbox-envelopes'),
      git_conflict_posture: 'local sqlite db ignored; use inbox export/import for portable envelopes',
    });
  });

  it('rejects ambiguous payload sources', async () => {
    const payloadPath = join(tempDir, 'payload.json');
    writeFileSync(payloadPath, '{}');

    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:ambiguous',
      kind: 'proposal',
      authorityLevel: 'operator_confirmed',
      payload: '{}',
      payloadFile: payloadPath,
    });

    expect(submitted.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((submitted.result as { error: string }).error).toContain('Use only one payload source');
  });

  it('enacts task promotion through the sanctioned task create command and is idempotent', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'user_chat',
      sourceRef: 'operator:manual',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({
        title: 'Handle captured inbox work',
        goal: 'Convert a captured envelope into governed work.',
        acceptance_criteria: ['Task exists', 'Promotion records task target'],
      }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const promoted = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'task',
      targetRef: 'Handle captured inbox work',
      by: 'operator',
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const result = promoted.result as {
      enactment_status: string;
      target_mutation: boolean;
      target: { task_number: number; title: string };
      envelope: { promotion: { target_ref: string; enactment_status: string } };
    };
    expect(result.enactment_status).toBe('enacted');
    expect(result.target_mutation).toBe(true);
    expect(result.target.task_number).toBe(101);
    expect(result.target.title).toBe('Handle captured inbox work');
    expect(result.envelope.promotion.target_ref).toBe('task:101');
    expect(result.envelope.promotion.enactment_status).toBe('enacted');

    const repeated = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'task',
      targetRef: 'Handle captured inbox work',
      by: 'operator',
    });
    expect(repeated.exitCode).toBe(ExitCode.SUCCESS);
    expect((repeated.result as { already_promoted: boolean }).already_promoted).toBe(true);
    const taskFiles = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'))
      .filter((file) => file.includes('handle-captured-inbox-work'));
    expect(taskFiles).toHaveLength(1);
  });

  it('promotes task candidates through the ergonomic inbox task alias with overrides', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'user_chat',
      sourceRef: 'operator:manual',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({
        title: 'Payload title',
        goal: 'Payload goal',
        acceptance_criteria: ['Payload criterion'],
      }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const promoted = await inboxTaskCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      by: 'operator',
      title: 'Override title',
      goal: 'Override goal',
      criteria: ['Override criterion A', 'Override criterion B'],
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const result = promoted.result as {
      target: { title: string; file_path: string };
      envelope: { promotion: { target_ref: string; enactment_status: string } };
    };
    expect(result.target.title).toBe('Override title');
    const taskContent = readFileSync(result.target.file_path, 'utf8');
    expect(taskContent).toContain('Override goal');
    expect(taskContent).toContain('- [ ] Override criterion A');
    expect(taskContent).toContain('- [ ] Override criterion B');
    expect(taskContent).not.toContain('Payload criterion');
    expect(result.envelope.promotion.enactment_status).toBe('enacted');
  });

  it('shows the next received inbox envelope without mutating it', async () => {
    await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual-a',
      kind: 'observation',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ note: 'Ignore' }),
    });
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual-b',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Next task candidate' }),
    });

    const next = await inboxNextCommand({
      cwd: tempDir,
      format: 'json',
      kind: 'task_candidate',
      limit: 2,
    });

    expect(next.exitCode).toBe(ExitCode.SUCCESS);
    const expected = (submitted.result as { envelope: { envelope_id: string } }).envelope;
    const result = next.result as { primary: { envelope_id: string; status: string }; alternatives: unknown[] };
    expect(result.primary.envelope_id).toBe(expected.envelope_id);
    expect(result.primary.status).toBe('received');
    expect(result.alternatives).toHaveLength(0);

    const listed = await inboxListCommand({ cwd: tempDir, format: 'json', status: 'received', limit: 10 });
    expect((listed.result as { count: number }).count).toBe(2);
  });

  it('triages envelopes to archive and task through explicit actions', async () => {
    const archiveCandidate = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'observation',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ note: 'No action' }),
    });
    const archiveEnvelope = (archiveCandidate.result as { envelope: { envelope_id: string } }).envelope;
    const archived = await inboxTriageCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: archiveEnvelope.envelope_id,
      action: 'archive',
      by: 'operator',
    });
    expect(archived.exitCode).toBe(ExitCode.SUCCESS);
    expect((archived.result as { envelope: { status: string } }).envelope.status).toBe('archived');

    const taskCandidate = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Triaged task' }),
    });
    setupRepo(tempDir);
    const taskEnvelope = (taskCandidate.result as { envelope: { envelope_id: string } }).envelope;
    const triagedTask = await inboxTriageCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: taskEnvelope.envelope_id,
      action: 'task',
      by: 'operator',
    });
    expect(triagedTask.exitCode).toBe(ExitCode.SUCCESS);
    expect((triagedTask.result as { enactment_status: string }).enactment_status).toBe('enacted');
  });

  it('returns work-next with admissible actions', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Work next task' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const workNext = await inboxWorkNextCommand({ cwd: tempDir, format: 'json' });

    expect(workNext.exitCode).toBe(ExitCode.SUCCESS);
    const result = workNext.result as {
      primary: { envelope_id: string };
      admissible_actions: Array<{ action: string; target_mutation: boolean; pending_kind?: string }>;
      alternatives_count: number;
    };
    expect(result.primary.envelope_id).toBe(envelope.envelope_id);
    expect(result.admissible_actions.map((action) => action.action)).toEqual(['task', 'archive', 'pending']);
    const pending = result.admissible_actions.find((action) => action.action === 'pending');
    expect(pending?.pending_kind).toBe('recorded_pending_crossing');
    expect(pending?.command_args).toEqual(['inbox', 'pending', envelope.envelope_id, '--to', '<kind>:<ref>', '--by', '<principal>']);
    expect(result.alternatives_count).toBe(0);
  });

  it('claims, releases, and claim-skips inbox work-next envelopes', async () => {
    const first = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual-first',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'First' }),
    });
    const second = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual-second',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Second' }),
    });
    const firstEnvelope = (first.result as { envelope: { envelope_id: string } }).envelope;
    const secondEnvelope = (second.result as { envelope: { envelope_id: string } }).envelope;

    const claimed = await inboxClaimCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: secondEnvelope.envelope_id,
      by: 'architect',
    });
    expect(claimed.exitCode).toBe(ExitCode.SUCCESS);
    expect((claimed.result as { envelope: { status: string; handling: { handled_by: string } } }).envelope.status).toBe('handling');

    const workNext = await inboxWorkNextCommand({ cwd: tempDir, format: 'json', claim: true, by: 'architect' });
    expect(workNext.exitCode).toBe(ExitCode.SUCCESS);
    const result = workNext.result as { primary: { envelope_id: string; status: string; handling: { handled_by: string } } };
    expect(result.primary.envelope_id).toBe(firstEnvelope.envelope_id);
    expect(result.primary.status).toBe('handling');
    expect(result.primary.handling.handled_by).toBe('architect');

    const released = await inboxReleaseCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: secondEnvelope.envelope_id,
      by: 'architect',
    });
    expect(released.exitCode).toBe(ExitCode.SUCCESS);
    expect((released.result as { envelope: { status: string; handling?: unknown } }).envelope.status).toBe('received');
  });

  it('archives envelopes without requiring a target ref or creating target work', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'observation',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ note: 'No action' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const archived = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'archive',
      by: 'operator',
    });

    expect(archived.exitCode).toBe(ExitCode.SUCCESS);
    expect((archived.result as { target_mutation: boolean }).target_mutation).toBe(false);
    const archivedEnvelope = (archived.result as { envelope: { status: string; promotion: { target_kind: string } } }).envelope;
    expect(archivedEnvelope.status).toBe('archived');
    expect(archivedEnvelope.promotion.target_kind).toBe('archive');
  });

  it('records unsupported promotion targets as pending, not enacted', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'proposal',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ title: 'Maybe change a site' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const promoted = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'site_config_change',
      targetRef: 'site:desktop-sunroom-2',
      by: 'operator',
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    expect(promoted.result).toMatchObject({
      enactment_status: 'pending',
      pending_kind: 'recorded_pending_crossing',
      target_mutation: false,
    });
  });

  it('requires target ref for pending triage', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'proposal',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ title: 'Maybe change a site' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const result = await inboxTriageCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      action: 'pending',
      targetKind: 'site_config_change',
      by: 'operator',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', error: expect.stringContaining('target-ref') });
  });

  it('records pending crossing through concise pending shortcut', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'proposal',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ title: 'Maybe change a site' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const pending = await inboxPendingCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      to: 'site_config_change:site:desktop-sunroom-2',
      by: 'operator',
    });

    expect(pending.exitCode).toBe(ExitCode.SUCCESS);
    expect(pending.result).toMatchObject({
      enactment_status: 'pending',
      pending_kind: 'recorded_pending_crossing',
      target_mutation: false,
    });
  });

  it('enacts the User Site PC template materialization site config crossing', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'agent_report',
      sourceRef: 'branch:test:env_source',
      kind: 'proposal',
      authorityLevel: 'agent_reported',
      principal: 'architect',
      payload: JSON.stringify({
        original_envelope_id: 'env_source',
        summary: 'Materialize User Site PC templates into concrete local PC Sites.',
      }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const promoted = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'site_config_change',
      targetRef: 'user-pc-template-materialization-workflow',
      by: 'architect',
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    expect(promoted.result).toMatchObject({
      enactment_status: 'enacted',
      target_mutation: true,
      target: {
        artifact_path: 'docs/product/user-pc-template-materialization-workflow.md',
        created: true,
      },
      envelope: {
        status: 'promoted',
        promotion: {
          target_kind: 'site_config_change',
          target_ref: 'user-pc-template-materialization-workflow',
          enactment_status: 'enacted',
        },
      },
    });
    const artifact = readFileSync(join(tempDir, 'docs', 'product', 'user-pc-template-materialization-workflow.md'), 'utf8');
    expect(artifact).toContain('User Site PC Template Materialization Workflow');
    expect(artifact).toContain('env_source');
  });

  it('upgrades an existing pending User Site PC template materialization crossing to enacted', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'agent_report',
      sourceRef: 'branch:test:env_pending',
      kind: 'proposal',
      authorityLevel: 'agent_reported',
      principal: 'architect',
      payload: JSON.stringify({ original_envelope_id: 'env_pending' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;
    const store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    try {
      store.promote(envelope.envelope_id, {
        target_kind: 'site_config_change',
        target_ref: 'user-pc-template-materialization-workflow',
        promoted_at: '2026-01-01T00:00:00.000Z',
        promoted_by: 'architect',
        enactment_status: 'pending',
        note: 'seeded pending crossing from old CLI behavior',
      });
    } finally {
      store.close();
    }

    const enacted = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'site_config_change',
      targetRef: 'user-pc-template-materialization-workflow',
      by: 'architect',
    });

    expect(enacted.exitCode).toBe(ExitCode.SUCCESS);
    expect(enacted.result).toMatchObject({
      enactment_status: 'enacted',
      target_mutation: true,
      envelope: {
        promotion: {
          enactment_status: 'enacted',
          target_command: 'site_config_change:user-pc-template-materialization-workflow',
        },
      },
    });
  });

  it('rejects invalid JSON payloads', async () => {
    const result = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'proposal',
      authorityLevel: 'user_statement',
      payload: '{not-json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error' });
  });
});

function setupRepo(tempDir: string): void {
  const tasksDir = join(tempDir, '.ai', 'do-not-open', 'tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, '20260420-100-alpha.md'),
    '---\nstatus: opened\n---\n\n# Task 100\n',
  );
}

function setupGitRepo(tempDir: string): void {
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['init', '-b', 'main'], { cwd: tempDir });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.email', 'test@example.invalid'], { cwd: tempDir });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.name', 'Test Agent'], { cwd: tempDir });
  writeFileSync(join(tempDir, 'README.md'), '# test\n');
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['add', 'README.md'], { cwd: tempDir });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['commit', '-m', 'base'], { cwd: tempDir });
}
