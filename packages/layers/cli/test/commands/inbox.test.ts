import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');
vi.unmock('node:child_process');

import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteInboxStore } from '@narada2/control-plane';
import {
  inboxArchitectProcessCommand,
  inboxClaimCommand,
  inboxDoctorCommand,
  inboxExportCommand,
  inboxImportCommand,
  inboxListCommand,
  inboxNextCommand,
  inboxPendingCommand,
  inboxPublishCommand,
  inboxPromoteCommand,
  inboxReleaseCommand,
  inboxShowCommand,
  inboxSubmitObservationCommand,
  inboxSubmitCommand,
  inboxTaskCommand,
  inboxTriageCommand,
  inboxWorkNextCommand,
} from '../../src/commands/inbox.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { taskReadCommand } from '../../src/commands/task-read.js';

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
    const submitResult = submitted.result as { portable_artifact: string; next_steps: { git_visible_handoff: string } };
    expect(submitResult.portable_artifact).toContain(join(tempDir, '.ai', 'inbox-envelopes'));
    expect(submitResult.next_steps.git_visible_handoff).toBe(submitResult.portable_artifact);
    expect(readdirSync(join(tempDir, '.ai', 'inbox-envelopes')).filter((name) => name.includes(envelope.envelope_id))).toHaveLength(1);

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

  it('returns compact submit output without echoing payload body when requested', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      output: 'compact',
      sourceKind: 'agent_report',
      sourceRef: 'architect-loop:test',
      kind: 'observation',
      authorityLevel: 'agent_reported',
      payload: JSON.stringify({ title: 'Compact output', body: 'do not echo this body in routine chat output' }),
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    expect(submitted.result).toMatchObject({
      status: 'success',
      envelope_id: expect.stringMatching(/^env_/),
      kind: 'observation',
      portable_artifact: expect.stringContaining(join(tempDir, '.ai', 'inbox-envelopes')),
      warnings: [],
      next_steps: {
        git_visible_handoff: expect.stringContaining(join(tempDir, '.ai', 'inbox-envelopes')),
      },
      output: {
        mode: 'compact',
        full_payload_available_with: '--output full',
      },
    });
    expect(JSON.stringify(submitted.result)).not.toContain('do not echo this body');
    expect(JSON.stringify(submitted.result)).not.toContain('"payload"');
  });

  it('retains full submit payload output when explicitly requested', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      output: 'full',
      sourceKind: 'agent_report',
      sourceRef: 'architect-loop:full',
      kind: 'observation',
      authorityLevel: 'agent_reported',
      payload: JSON.stringify({ title: 'Full output', body: 'full mode keeps payload available' }),
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const envelope = (submitted.result as { envelope: { payload: Record<string, unknown> } }).envelope;
    expect(envelope.payload.body).toBe('full mode keeps payload available');
  });

  it('resolves package-subdirectory submit cwd to git root authority', async () => {
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['init', '-b', 'main'], { cwd: tempDir });
    const packageDir = join(tempDir, 'packages', 'layers', 'cli');
    mkdirSync(packageDir, { recursive: true });

    const submitted = await inboxSubmitObservationCommand({
      cwd: packageDir,
      format: 'json',
      sourceRef: 'test:package-subdir',
      title: 'Package subdir should not own inbox',
      principal: 'architect',
      targetLocus: 'local_site',
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const result = submitted.result as {
      cwd_preflight?: { authority_cwd: string; resolved_to_git_root: boolean };
      delivery?: { inbox_db_path: string; export_dir: string };
      next_steps?: { git_visible_handoff?: string };
    };
    expect(result.cwd_preflight).toMatchObject({
      authority_cwd: tempDir,
      resolved_to_git_root: true,
    });
    expect(result.delivery?.inbox_db_path).toBe(join(tempDir, '.ai', 'inbox.db'));
    expect(result.next_steps?.git_visible_handoff).toContain(join(tempDir, '.ai', 'inbox-envelopes'));
    expect(existsSync(join(packageDir, '.ai', 'inbox.db'))).toBe(false);
    expect(existsSync(join(packageDir, '.ai', 'inbox-envelopes'))).toBe(false);
  });

  it('enforces configured message routing authority for inbox submissions', async () => {
    writeFileSync(join(tempDir, 'config.json'), JSON.stringify({
      message_routing_authority: {
        default_policy: 'deny_cross_locus_unless_allowed',
        principals: {
          builder: {
            may_send: [
              { target_locus: 'local_user_site', kinds: ['observation'], authority_levels: ['agent_reported'], condition: 'always' },
            ],
            may_not_send: [
              { target_locus: 'narada_proper', kinds: ['*'], reason: 'Builder reports locally; Architect escalates upstream.' },
            ],
          },
          architect: {
            may_send: [
              { target_locus: 'narada_proper', kinds: ['observation'], authority_levels: ['agent_reported'], condition: 'after_local_admission_or_explicit_operator_instruction' },
            ],
          },
        },
      },
    }), 'utf8');

    const allowedBuilder = await inboxSubmitObservationCommand({
      cwd: tempDir,
      format: 'json',
      sourceRef: 'test:local-builder',
      title: 'Local handoff',
      principal: 'builder',
      targetLocus: 'local_user_site',
    });
    expect(allowedBuilder.exitCode).toBe(ExitCode.SUCCESS);

    const refusedBuilder = await inboxSubmitObservationCommand({
      cwd: tempDir,
      format: 'json',
      sourceRef: 'test:builder-upstream',
      title: 'Upstream attempt',
      principal: 'builder',
      targetLocus: 'narada_proper',
    });
    expect(refusedBuilder.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((refusedBuilder.result as { error: string }).error).toContain('Builder reports locally');

    const allowedArchitect = await inboxSubmitObservationCommand({
      cwd: tempDir,
      format: 'json',
      sourceRef: 'test:architect-upstream',
      title: 'Upstream escalation',
      principal: 'architect',
      targetLocus: 'narada_proper',
    });
    expect(allowedArchitect.exitCode).toBe(ExitCode.SUCCESS);
    expect((allowedArchitect.result as { routing: { status: string } }).routing.status).toBe('admitted');

    const doctor = await inboxDoctorCommand({ cwd: tempDir, format: 'json' });
    expect(doctor.exitCode).toBe(ExitCode.SUCCESS);
    expect((doctor.result as { message_routing_authority: { principals: string[] } }).message_routing_authority.principals).toEqual(['architect', 'builder']);
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

  it('accepts --authority-principal alias on low-level submit', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:authority-principal',
      kind: 'proposal',
      authorityLevel: 'operator_confirmed',
      authorityPrincipal: 'architect',
      payload: JSON.stringify({ title: 'Authority alias' }),
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const envelope = (submitted.result as { envelope: { authority: { principal?: string } } }).envelope;
    expect(envelope.authority.principal).toBe('architect');
  });

  it('submits shell-safe observations with read-back confirmation and export guidance', async () => {
    const submitted = await inboxSubmitObservationCommand({
      cwd: tempDir,
      format: 'json',
      sourceRef: 'codex-session:test',
      title: 'Observed friction',
      summary: 'Submission should not require raw JSON quoting.',
      evidence: ['Raw JSON was fragile', 'Read-back is required'],
      proposal: ['Use a structured observation command'],
      recommendation: 'Promote to task when actionable',
      principal: 'architect',
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const result = submitted.result as {
      envelope: { envelope_id: string; kind: string; source: { kind: string }; payload: Record<string, unknown> };
      confirmation: { read_back_envelope_id: string; payload_equivalent: boolean };
      next_steps: { export_command: string; publish_command: string; publish_push_command: string; git_visible_handoff: string };
    };
    expect(result.envelope.kind).toBe('observation');
    expect(result.envelope.source.kind).toBe('user_chat');
    expect(result.envelope.payload).toMatchObject({
      title: 'Observed friction',
      summary: 'Submission should not require raw JSON quoting.',
      evidence: ['Raw JSON was fragile', 'Read-back is required'],
      proposal: ['Use a structured observation command'],
      recommendation: 'Promote to task when actionable',
    });
    expect(result.confirmation).toEqual({
      read_back_envelope_id: result.envelope.envelope_id,
      payload_equivalent: true,
    });
    expect(result.next_steps.export_command).toBe('narada inbox export --format json');
    expect(result.next_steps.publish_command).toBe('narada inbox publish --execute');
    expect(result.next_steps.publish_push_command).toBe('narada inbox publish --execute --push');
    expect(result.next_steps.git_visible_handoff).toContain(result.envelope.envelope_id);
  });

  it('accepts --authority-principal alias on submit-observation', async () => {
    const submitted = await inboxSubmitObservationCommand({
      cwd: tempDir,
      format: 'json',
      sourceRef: 'codex-session:authority-principal',
      title: 'Observed alias',
      authorityPrincipal: 'builder',
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const result = submitted.result as {
      envelope: { authority: { principal?: string }; payload: Record<string, unknown> };
      confirmation: { payload_equivalent: boolean };
    };
    expect(result.envelope.authority.principal).toBe('builder');
    expect(result.envelope.payload.title).toBe('Observed alias');
    expect(result.confirmation.payload_equivalent).toBe(true);
  });

  it('rejects empty observation payloads unless explicitly allowed', async () => {
    const rejected = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:empty',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
    });

    expect(rejected.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((rejected.result as { error: string }).error).toContain('Empty payload is not admissible');

    const allowed = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:empty',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      allowEmptyPayload: true,
    });

    expect(allowed.exitCode).toBe(ExitCode.SUCCESS);
    expect((allowed.result as { envelope: { payload: unknown } }).envelope.payload).toEqual({});
  });

  it('names invalid enum fields and allowed values', async () => {
    const result = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'chat',
      sourceRef: 'manual:bad-enum',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Bad enum' }),
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((result.result as { error: string }).error).toContain('Invalid --source-kind: chat');
    expect((result.result as { error: string }).error).toContain('user_chat');
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
      runtime: Record<string, unknown>;
      checks: Array<{ name: string; ok: boolean }>;
    };
    expect(result.delivery).toMatchObject({ repo_root: tempDir, branch: 'main' });
    expect(result.runtime).toMatchObject({
      node_exec_path: process.execPath,
      node_platform: process.platform,
      node_version: process.version,
      cli_entrypoint: expect.any(String),
      cli_entrypoint_exists: true,
      expected_repo_dist_entrypoint: join(tempDir, 'packages', 'layers', 'cli', 'dist', 'main.js'),
      expected_repo_dist_present: false,
      canonical_inbox_commands_available: false,
    });
    expect(result.runtime).toHaveProperty('runtime_posture');
    expect(result.runtime).toHaveProperty('runtime_origin_detail');
    expect(result.runtime).toHaveProperty('preflight_recommendation');
    expect(result.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      'repo_detected',
      'inbox_db_accessible',
      'sqlite_binding_loaded',
      'cli_build_present',
      'node_runtime_origin',
      'cli_entrypoint_exists',
      'canonical_inbox_commands_available',
    ]));
    const after = await inboxListCommand({ cwd: tempDir, format: 'json' });
    expect((after.result as { count: number }).count).toBe((before.result as { count: number }).count);
  });

  it('reports broken delegated Narada CLI embodiments separately from inbox runtime health', async () => {
    setupGitRepo(tempDir);
    const delegatedMain = join(tempDir, 'delegated', 'packages', 'layers', 'cli', 'dist', 'main.js');
    mkdirSync(join(tempDir, 'delegated', 'packages', 'layers', 'cli', 'dist'), { recursive: true });
    writeFileSync(delegatedMain, "require('@narada2/missing-task-governance-fixture')\n", 'utf8');
    writeFileSync(tempDir + '/package.json', JSON.stringify({
      scripts: {
        status: 'node ./delegated/packages/layers/cli/dist/main.js status',
      },
    }), 'utf8');

    const doctor = await inboxDoctorCommand({ cwd: tempDir, format: 'json' });

    const result = doctor.result as {
      runtime: {
        delegated_cli_embodiment: {
          ok: boolean;
          configured: boolean;
          scripts: Array<{ script_name: string; loadable: boolean; detail: string }>;
        };
      };
      checks: Array<{ name: string; ok: boolean; detail: string }>;
    };
    expect(result.runtime.delegated_cli_embodiment).toMatchObject({
      configured: true,
      ok: false,
    });
    expect(result.runtime.delegated_cli_embodiment.scripts[0]).toMatchObject({
      script_name: 'status',
      loadable: false,
      failure_kind: 'execution_failed',
      repair_command: 'pnpm --filter @narada2/cli build && pnpm run narada:install-shim',
    });
    expect(result.runtime.delegated_cli_embodiment.scripts[0]?.detail).toContain('@narada2/missing-task-governance-fixture');
    expect(result.checks.find((check) => check.name === 'delegated_cli_embodiment_loadable')).toMatchObject({
      ok: false,
    });
  });

  it('reports declared delegated CLI invocation contracts and classifies node-not-found failures', async () => {
    setupGitRepo(tempDir);
    const wrapper = join(tempDir, 'delegated-narada.sh');
    writeFileSync(wrapper, '#!/bin/sh\nPATH=/definitely-missing\nexec node ./packages/layers/cli/dist/main.js "$@"\n', 'utf8');
    writeFileSync(tempDir + '/package.json', JSON.stringify({
      narada: {
        delegated_cli_embodiment: {
          command: 'sh ./delegated-narada.sh',
          cwd: '.',
          shell: 'non_login',
          repair_command: 'pnpm run narada:install-shim',
        },
      },
    }), 'utf8');

    const doctor = await inboxDoctorCommand({ cwd: tempDir, format: 'json' });

    const result = doctor.result as {
      runtime: {
        delegated_cli_embodiment: {
          ok: boolean;
          configured: boolean;
          invocation_contract: { command: string; shell: string; repair_command: string } | null;
          scripts: Array<{ script_name: string; loadable: boolean; failure_kind: string; repair_command: string }>;
        };
      };
    };
    expect(result.runtime.delegated_cli_embodiment).toMatchObject({
      configured: true,
      ok: false,
      invocation_contract: {
        command: 'sh ./delegated-narada.sh',
        shell: 'non_login',
        repair_command: 'pnpm run narada:install-shim',
      },
    });
    expect(result.runtime.delegated_cli_embodiment.scripts[0]).toMatchObject({
      script_name: 'narada.delegated_cli_embodiment',
      loadable: false,
      failure_kind: 'missing_node',
      repair_command: 'pnpm run narada:install-shim',
    });
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

  it('skips duplicate exported envelope files in a single import pass', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:portable-duplicate',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Portable duplicate envelope' }),
    });
    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);

    const exportDir = join(tempDir, 'exports');
    const exported = await inboxExportCommand({
      cwd: tempDir,
      format: 'json',
      outDir: exportDir,
    });
    expect(exported.exitCode).toBe(ExitCode.SUCCESS);
    const [original] = readdirSync(exportDir).filter((name) => name.endsWith('.json'));
    expect(original).toBeTruthy();
    writeFileSync(
      join(exportDir, `duplicate-${original}`),
      readFileSync(join(exportDir, original!), 'utf8'),
    );

    const importedDir = mkdtempSync(join(tmpdir(), 'narada-inbox-import-duplicates-'));
    try {
      const imported = await inboxImportCommand({
        cwd: importedDir,
        format: 'json',
        fromDir: exportDir,
      });
      expect(imported.exitCode).toBe(ExitCode.SUCCESS);
      expect(imported.result).toMatchObject({ imported: 1, skipped: 1 });

      const repeated = await inboxImportCommand({
        cwd: importedDir,
        format: 'json',
        fromDir: exportDir,
      });
      expect(repeated.exitCode).toBe(ExitCode.SUCCESS);
      expect(repeated.result).toMatchObject({ imported: 0, skipped: 2 });
    } finally {
      rmSync(importedDir, { recursive: true, force: true });
    }
  });

  it('auto-refreshes work-next from exported envelope artifacts', async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), 'narada-inbox-export-source-'));
    try {
      const submitted = await inboxSubmitCommand({
        cwd: sourceDir,
        format: 'json',
        sourceKind: 'agent_report',
        sourceRef: 'codex-session:auto-refresh',
        kind: 'observation',
        authorityLevel: 'agent_reported',
        principal: 'codex',
        payload: JSON.stringify({ title: 'Auto refresh visible' }),
      });
      expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
      const exportDir = join(tempDir, '.ai', 'inbox-envelopes');
      const exported = await inboxExportCommand({
        cwd: sourceDir,
        format: 'json',
        outDir: exportDir,
      });
      expect(exported.exitCode).toBe(ExitCode.SUCCESS);

      const next = await inboxWorkNextCommand({ cwd: tempDir, format: 'json' });

      expect(next.exitCode).toBe(ExitCode.SUCCESS);
      const primary = (next.result as { primary: { payload: { title: string } } | null }).primary;
      expect(primary?.payload.title).toBe('Auto refresh visible');
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it('reports conflict-safe local DB posture in doctor delivery coordinates', async () => {
    setupGitRepo(tempDir);
    const doctor = await inboxDoctorCommand({ cwd: tempDir, format: 'json' });
    const result = doctor.result as { delivery: Record<string, unknown>; refresh: Record<string, unknown>; publication: Record<string, unknown> };
    const delivery = result.delivery;
    expect(delivery).toMatchObject({
      export_dir: join(tempDir, '.ai', 'inbox-envelopes'),
      git_conflict_posture: 'local sqlite db ignored; use inbox publish/export/import for portable envelopes',
    });
    expect(result.publication).toMatchObject({
      status: 'published_or_no_artifacts_pending',
      uncommitted_envelope_artifacts_count: 0,
      unpushed_commit_count: 0,
    });
    expect(result.refresh).toMatchObject({ imported: 0, skipped: 0, exported_count: 0 });
  });

  it('doctor reports uncommitted portable inbox envelope artifacts', async () => {
    setupGitRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:publication',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Publication pending' }),
    });
    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);

    const doctor = await inboxDoctorCommand({ cwd: tempDir, format: 'json' });
    const result = doctor.result as {
      publication: {
        status: string;
        uncommitted_envelope_artifacts_count: number;
        uncommitted_envelope_artifacts: string[];
        next_steps: string[];
      };
      checks: Array<{ name: string; ok: boolean; detail: string }>;
    };

    expect(result.publication.status).toBe('publication_pending');
    expect(result.publication.uncommitted_envelope_artifacts_count).toBe(1);
    expect(result.publication.uncommitted_envelope_artifacts[0]).toContain('.ai/inbox-envelopes');
    expect(result.publication.next_steps).toContain('narada inbox publish --execute');
    expect(result.checks.find((check) => check.name === 'inbox_envelope_artifacts_committed')).toMatchObject({
      ok: false,
      detail: '1 uncommitted inbox envelope artifact(s)',
    });
  });

  it('dry-runs inbox publication without exporting or staging artifacts', async () => {
    setupGitRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:publish-dry-run',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Dry-run publication' }),
    });
    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    rmSync(join(tempDir, '.ai', 'inbox-envelopes'), { recursive: true, force: true });

    const published = await inboxPublishCommand({ cwd: tempDir, format: 'json' });

    expect(published.exitCode).toBe(ExitCode.SUCCESS);
    expect(published.result).toMatchObject({
      status: 'dry_run',
      execute_required: true,
      would_export_count: 1,
      would_stage: ['.ai/inbox-envelopes'],
      next_steps: ['narada inbox publish --execute', 'narada inbox publish --execute --push'],
      repository_publication_crossing: {
        zone: 'Repository Publication Intent Zone',
        posture: 'dry_run',
      },
    });
    expect(() => readdirSync(join(tempDir, '.ai', 'inbox-envelopes'))).toThrow();
    const staged = execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['diff', '--cached', '--name-only'], {
      cwd: tempDir,
      encoding: 'utf8',
    }).trim();
    expect(staged).toBe('');
  });

  it('executes inbox publication by exporting, staging, and committing only portable artifacts', async () => {
    setupGitRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:publish-execute',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Execute publication' }),
    });
    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    rmSync(join(tempDir, '.ai', 'inbox-envelopes'), { recursive: true, force: true });

    const published = await inboxPublishCommand({
      cwd: tempDir,
      format: 'json',
      execute: true,
      message: 'Publish test inbox artifacts',
    });

    expect(published.exitCode).toBe(ExitCode.SUCCESS);
    const result = published.result as {
      status: string;
      exported_count: number;
      staged_files: string[];
      commit: string;
      pushed: boolean;
      next_steps: string[];
      repository_publication_crossing: { zone: string; posture: string };
    };
    expect(result.status).toBe('committed');
    expect(result.exported_count).toBe(1);
    expect(result.staged_files).toHaveLength(1);
    expect(result.staged_files[0]).toContain('.ai/inbox-envelopes');
    expect(result.commit).toMatch(/^[0-9a-f]+$/);
    expect(result.pushed).toBe(false);
    expect(result.next_steps).toEqual(['narada inbox publish --execute --push']);
    expect(result.repository_publication_crossing).toMatchObject({
      zone: 'Repository Publication Intent Zone',
      posture: 'committed_not_pushed',
    });

    const trackedDb = execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['ls-files', '--', '.ai/inbox.db'], {
      cwd: tempDir,
      encoding: 'utf8',
    }).trim();
    expect(trackedDb).toBe('');
    const subject = execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['log', '-1', '--pretty=%s'], {
      cwd: tempDir,
      encoding: 'utf8',
    }).trim();
    expect(subject).toBe('Publish test inbox artifacts');
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

  it('architect-process creates a detailed Builder-owned task handoff without executing work', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'agent_report',
      sourceRef: 'architect:test',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'architect',
      payload: JSON.stringify({
        title: 'Fix routed observation handling',
        goal: 'Implement governed handling for routed observations.',
        required_work: [
          'Inspect the routing surface.',
          'Add the minimal implementation change.',
          'Verify with a focused regression test.',
        ],
        acceptance_criteria: [
          'Routed observations are handled through a governed command.',
          'Focused regression test passes.',
        ],
      }),
    });
    const envelopeId = (submitted.result as { envelope: { envelope_id: string } }).envelope.envelope_id;

    const processed = await inboxArchitectProcessCommand({
      cwd: tempDir,
      envelopeId,
      by: 'architect',
      builder: 'builder',
      format: 'json',
    });

    expect(processed.exitCode).toBe(ExitCode.SUCCESS);
    const result = processed.result as {
      task: { task_number: number; file_path: string };
      builder: string;
      execution_performed: boolean;
      forbidden_actions: string[];
      exported_artifacts: { inbox_envelopes: string[]; lifecycle_snapshot: string };
    };
    expect(result.builder).toBe('builder');
    expect(result.execution_performed).toBe(false);
    expect(result.forbidden_actions).toEqual(expect.arrayContaining(['implementation', 'task report', 'task close', 'self-review']));
    expect(result.exported_artifacts.inbox_envelopes).toHaveLength(1);
    expect(existsSync(result.exported_artifacts.lifecycle_snapshot)).toBe(true);

    const read = await taskReadCommand({
      cwd: tempDir,
      taskNumber: String(result.task.task_number),
      format: 'json',
    });
    const task = (read.result as { task: { status: string; assignment: { agent_id: string }; required_work: string } }).task;
    expect(task.status).toBe('claimed');
    expect(task.assignment.agent_id).toBe('builder');
    expect(task.required_work).toContain('Inspect the routing surface.');
    expect(task.required_work).not.toContain('TBD');

    const stored = await inboxShowCommand({ cwd: tempDir, envelopeId, format: 'json' });
    const envelope = (stored.result as { envelope: { promotion: { target_kind: string; target_ref: string; target_command: string } } }).envelope;
    expect(envelope.promotion).toMatchObject({
      target_kind: 'task',
      target_ref: `task:${result.task.task_number}`,
      target_command: 'inbox architect-process',
    });
  });

  it('architect-process refuses non-taskable envelopes', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:question',
      kind: 'question',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Question only' }),
    });
    const envelopeId = (submitted.result as { envelope: { envelope_id: string } }).envelope.envelope_id;

    const processed = await inboxArchitectProcessCommand({
      cwd: tempDir,
      envelopeId,
      by: 'architect',
      format: 'json',
    });

    expect(processed.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((processed.result as { error: string }).error).toContain('cannot be processed into Builder task handoff');
  });

  it('creates assigned tasks directly from observation envelopes with source-linked context', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'agent_report',
      sourceRef: 'staccato:runtime',
      kind: 'observation',
      authorityLevel: 'agent_reported',
      payload: JSON.stringify({
        title: 'Fix runtime drift',
        summary: 'Runtime drift was observed in a delegated Site command surface.',
        evidence: ['doctor showed stale command surface', 'runtime DB remained healthy'],
        recommendation: 'Separate command-surface health from runtime health.',
      }),
    });
    const envelopeId = (submitted.result as { envelope: { envelope_id: string } }).envelope.envelope_id;

    const promoted = await inboxTaskCommand({
      cwd: tempDir,
      envelopeId,
      by: 'architect',
      assign: 'builder',
      format: 'json',
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const result = promoted.result as {
      target: { task_number: number; file_path: string };
      assignment: { agent_id: string };
    };
    expect(result.assignment.agent_id).toBe('builder');
    const taskContent = readFileSync(result.target.file_path, 'utf8');
    expect(taskContent).toContain('Source inbox envelope:');
    expect(taskContent).toContain(envelopeId);
    expect(taskContent).toContain('Source: agent_report:staccato:runtime');
    expect(taskContent).toContain('Runtime drift was observed');
    expect(taskContent).toContain('Recommendation addressed or explicitly rejected');
    expect(taskContent).not.toContain('TBD');
  });

  it('creates complete tasks directly from proposal envelopes', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'user_chat',
      sourceRef: 'operator:proposal',
      kind: 'proposal',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({
        title: 'Add proposal route',
        summary: 'A proposal should become an executable task without manual markdown editing.',
        proposal: ['Add direct inbox task creation.', 'Preserve source linkage.'],
        required_work: ['Implement the direct route.', 'Verify proposal handling.'],
      }),
    });
    const envelopeId = (submitted.result as { envelope: { envelope_id: string } }).envelope.envelope_id;

    const promoted = await inboxTaskCommand({
      cwd: tempDir,
      envelopeId,
      by: 'architect',
      format: 'json',
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const result = promoted.result as { target: { file_path: string }; assignment: null };
    expect(result.assignment).toBeNull();
    const taskContent = readFileSync(result.target.file_path, 'utf8');
    expect(taskContent).toContain('Implement the direct route.');
    expect(taskContent).toContain('Proposal handled: Add direct inbox task creation.');
    expect(taskContent).toContain(envelopeId);
    expect(taskContent).not.toContain('TBD');
  });

  it('routes inbox envelopes to existing task targets with validation and clear rendering', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:route',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Route this to existing task' }),
    });
    const envelopeId = (submitted.result as { envelope: { envelope_id: string } }).envelope.envelope_id;

    const routed = await inboxPendingCommand({
      cwd: tempDir,
      envelopeId,
      to: 'task:100',
      by: 'architect',
      format: 'json',
    });

    expect(routed.exitCode).toBe(ExitCode.SUCCESS);
    const result = routed.result as {
      target: { task_number: number; task_id: string };
      envelope: { promotion: { target_kind: string; target_ref: string; target_result: { task_number: number; task_id: string } } };
    };
    expect(result.target).toEqual({ task_number: 100, task_id: '20260420-100-alpha' });
    expect(result.envelope.promotion).toMatchObject({
      target_kind: 'task',
      target_ref: 'task:100',
      target_result: { task_number: 100, task_id: '20260420-100-alpha' },
    });

    const shown = await inboxShowCommand({ cwd: tempDir, envelopeId, format: 'human' });
    expect((shown.result as { _formatted: string })._formatted).toContain('Promotion: task:100 (20260420-100-alpha)');
  });

  it('rejects missing and malformed task targets without breaking other pending targets', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual:route-missing',
      kind: 'observation',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Route missing task' }),
    });
    const envelopeId = (submitted.result as { envelope: { envelope_id: string } }).envelope.envelope_id;

    const malformed = await inboxPendingCommand({
      cwd: tempDir,
      envelopeId,
      to: 'task:not-a-number',
      by: 'architect',
      format: 'json',
    });
    expect(malformed.exitCode).toBe(ExitCode.GENERAL_ERROR);

    const missing = await inboxPendingCommand({
      cwd: tempDir,
      envelopeId,
      to: 'task:999',
      by: 'architect',
      format: 'json',
    });
    expect(missing.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((missing.result as { error: string }).error).toContain('Task target does not exist');

    const decision = await inboxPendingCommand({
      cwd: tempDir,
      envelopeId,
      to: 'decision:route-later',
      by: 'architect',
      format: 'json',
    });
    expect(decision.exitCode).toBe(ExitCode.SUCCESS);
    expect((decision.result as { envelope: { promotion: { target_kind: string } } }).envelope.promotion.target_kind).toBe('decision');
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

  it('reports sibling embodiment file-drop candidates in work-next', async () => {
    const sibling = mkdtempSync(join(tmpdir(), 'narada-inbox-sibling-'));
    try {
      mkdirSync(join(tempDir, '.ai'), { recursive: true });
      mkdirSync(join(sibling, '.ai', 'inbox-drop'), { recursive: true });
      writeFileSync(join(sibling, '.ai', 'inbox-drop', '20260428-001-pending.md'), '# Pending\n');
      writeFileSync(join(tempDir, '.ai', 'authority-clone.json'), JSON.stringify({
        authority_root: tempDir,
        embodiments: [
          { id: 'authority', root: tempDir, role: 'authority', mutation_policy: 'allow' },
          { id: 'sibling', root: sibling, role: 'read_only_forwarding', mutation_policy: 'refuse_or_forward' },
        ],
      }));

      const workNext = await inboxWorkNextCommand({ cwd: tempDir, format: 'json' });

      expect(workNext.exitCode).toBe(ExitCode.SUCCESS);
      const result = workNext.result as {
        primary: null;
        embodiment_file_drops: Array<{ embodiment_id: string; pending_file_count: number; command_args: string[] }>;
        warnings: string[];
      };
      expect(result.primary).toBeNull();
      expect(result.embodiment_file_drops).toEqual([
        expect.objectContaining({
          embodiment_id: 'sibling',
          pending_file_count: 1,
          command_args: ['inbox', 'ingest-files', '--from', join(sibling, '.ai', 'inbox-drop')],
        }),
      ]);
      expect(result.warnings[0]).toContain('Embodiment sibling has 1 pending inbox-drop file(s)');
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('reports sibling embodiment file-drop candidates in next', async () => {
    const sibling = mkdtempSync(join(tmpdir(), 'narada-inbox-sibling-'));
    try {
      mkdirSync(join(tempDir, '.ai'), { recursive: true });
      mkdirSync(join(sibling, '.ai', 'inbox-drop'), { recursive: true });
      writeFileSync(join(sibling, '.ai', 'inbox-drop', '20260428-001-pending.md'), '# Pending\n');
      writeFileSync(join(tempDir, '.ai', 'authority-clone.json'), JSON.stringify({
        authority_root: tempDir,
        embodiments: [
          { id: 'authority', root: tempDir, role: 'authority', mutation_policy: 'allow' },
          { id: 'sibling', root: sibling, role: 'read_only_forwarding', mutation_policy: 'refuse_or_forward' },
        ],
      }));

      const next = await inboxNextCommand({ cwd: tempDir, format: 'json' });

      expect(next.exitCode).toBe(ExitCode.SUCCESS);
      const result = next.result as {
        primary: null;
        embodiment_file_drops: Array<{ embodiment_id: string; pending_file_count: number }>;
      };
      expect(result.primary).toBeNull();
      expect(result.embodiment_file_drops).toEqual([
        expect.objectContaining({ embodiment_id: 'sibling', pending_file_count: 1 }),
      ]);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
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
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  writeFileSync(
    join(tasksDir, '20260420-100-alpha.md'),
    '---\nstatus: opened\n---\n\n# Task 100\n',
  );
  writeFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), JSON.stringify({
    version: 2,
    schema: 'https://narada.dev/schemas/agent-roster/v2',
    updated_at: '2026-04-20T00:00:00.000Z',
    agents: [
      {
        agent_id: 'builder',
        role: 'builder',
        capabilities: ['derive', 'propose', 'claim', 'execute', 'resolve', 'confirm'],
        first_seen_at: '2026-04-20T00:00:00.000Z',
        last_active_at: '2026-04-20T00:00:00.000Z',
        status: 'idle',
        task: null,
        last_done: null,
        updated_at: '2026-04-20T00:00:00.000Z',
      },
    ],
  }, null, 2));
}

function setupGitRepo(tempDir: string): void {
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['init', '-b', 'main'], { cwd: tempDir });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.email', 'test@example.invalid'], { cwd: tempDir });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.name', 'Test Agent'], { cwd: tempDir });
  writeFileSync(join(tempDir, 'README.md'), '# test\n');
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['add', 'README.md'], { cwd: tempDir });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['commit', '-m', 'base'], { cwd: tempDir });
}
