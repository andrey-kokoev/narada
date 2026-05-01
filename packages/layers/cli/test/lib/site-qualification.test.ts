import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateSiteQualification } from '../../src/lib/site-qualification.js';
import {
  qualificationEffectivenessRecordCommand,
  qualificationRecordAddCommand,
  qualificationStatusCommand,
} from '../../src/commands/qualification.js';
import type { LawAdmissionResult } from '../../src/lib/law-sync.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('Site qualification', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-site-qualification-'));
    mkdirSync(join(tempDir, '.ai'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports qualification_current for a qualified agent', () => {
    writeQualification({
      policies: [{ role_id: 'builder', work_class: 'task_construction' }],
      records: [{
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
      }],
    });

    const result = evaluateSiteQualification({ cwd: tempDir, principalId: 'builder', roleId: 'builder', workClass: 'task_construction' });

    expect(result.state).toBe('qualification_current');
    expect(result.blocked_work_classes).toEqual([]);
  });

  it('reports expired qualification without blocking safe inspection commands', () => {
    writeQualification({
      policies: [{ role_id: 'builder', work_class: 'task_construction' }],
      records: [{
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
        expires_at: '2026-01-01T00:00:00.000Z',
      }],
    });

    const result = evaluateSiteQualification({
      cwd: tempDir,
      principalId: 'builder',
      roleId: 'builder',
      workClass: 'task_construction',
      now: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(result.state).toBe('expired');
    expect(result.blocked_work_classes).toEqual(['task_construction']);
    expect(result.allowed_safe_actions).toContain('narada work-next --agent builder --peek --format json');
  });

  it('requires qualification after a new law change until receipt or absorption', () => {
    writeQualification({
      policies: [{ role_id: 'builder', work_class: 'task_construction' }],
      records: [{
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
      }],
    });
    const lawAdmission: LawAdmissionResult = {
      status: 'blocked',
      agent_id: 'builder',
      role: 'builder',
      unread: [{
        change_id: 'law_1',
        summary: 'Changed builder law',
        scope: 'builder',
        required_roles: ['builder'],
        files: ['AGENTS.md'],
        notice_envelope_id: null,
        affected_agents: [],
        receipt_state: 'issued',
        receipt_status: null,
        escalation_required: false,
      }],
    };

    const result = evaluateSiteQualification({ cwd: tempDir, principalId: 'builder', roleId: 'builder', workClass: 'task_construction', lawAdmission });

    expect(result.state).toBe('qualification_required');
    expect(result.commands.receipt).toBe('narada law ack law_1 --agent builder --role builder --status acknowledged');
    expect(result.commands.absorption).toBe('narada law ack law_1 --agent builder --role builder --status absorbed');
  });

  it('does not treat receipt-only law awareness as effectiveness evidence', () => {
    writeQualification({
      policies: [{ role_id: 'builder', work_class: 'task_construction', completed_task_count_trigger: 1 }],
      completed_task_count_observed: 1,
      records: [{
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
        evidence_refs: ['law_receipt:law_1'],
        completed_task_count_at_issue: 0,
      }],
    });

    const result = evaluateSiteQualification({ cwd: tempDir, principalId: 'builder', roleId: 'builder', workClass: 'task_construction' });

    expect(result.state).toBe('effectiveness_check_required');
  });

  it('supports N completed tasks as an effectiveness-check policy trigger', () => {
    writeQualification({
      completed_task_count_observed: 3,
      policies: [{ role_id: 'builder', work_class: 'task_construction', completed_task_count_trigger: 3 }],
      records: [{
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
        completed_task_count_at_issue: 0,
      }],
    });

    const result = evaluateSiteQualification({ cwd: tempDir, principalId: 'builder', roleId: 'builder', workClass: 'task_construction' });

    expect(result.state).toBe('effectiveness_check_required');
    expect(result.reason).toContain('completed-task-count trigger reached');
    expect(result.commands.effectiveness_check).toBe('narada qualification effectiveness-check --agent builder --role builder --work-class task_construction');
  });

  it('blocks sensitive work unless the record explicitly admits that class', () => {
    writeQualification({
      policies: [{ role_id: 'builder', work_class: 'task_construction', sensitive: true }],
      records: [{
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
        sensitive_work_admitted: false,
      }],
    });

    const result = evaluateSiteQualification({ cwd: tempDir, principalId: 'builder', roleId: 'builder', workClass: 'task_construction' });

    expect(result.state).toBe('blocked');
    expect(result.reason).toBe('sensitive work requires explicit qualification admission');
  });

  it('exposes qualification status through a read-only command surface', async () => {
    writeQualification({
      policies: [{ role_id: 'builder', work_class: 'task_construction' }],
      records: [{
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
      }],
    });

    const result = await qualificationStatusCommand({ cwd: tempDir, agent: 'builder', role: 'builder', workClass: 'task_construction', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: false,
      qualification: {
        state: 'qualification_current',
      },
    });
  });

  it('persists full qualification records as Git-visible Site evidence', async () => {
    const result = await qualificationRecordAddCommand({
      cwd: tempDir,
      agent: 'builder',
      role: 'builder',
      site: 'narada',
      workClass: 'task_construction',
      lawSources: 'AGENTS.md,SEMANTICS.md',
      contextSurfaces: 'role-loop,work-next',
      evidence: 'task:1184,verification_run:run_1',
      issuer: 'operator',
      admittedBy: 'architect',
      expiresAt: '2026-06-01T00:00:00.000Z',
      effectivenessInterval: '5',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: true,
      evidence_locus: '.ai/site-qualification.json',
      record: {
        site_id: 'narada',
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        law_sources: ['AGENTS.md', 'SEMANTICS.md'],
        context_surfaces: ['role-loop', 'work-next'],
        evidence_refs: ['task:1184', 'verification_run:run_1'],
        issuer: 'operator',
        admitted_by: 'architect',
        expires_at: '2026-06-01T00:00:00.000Z',
      },
    });
  });

  it('records effectiveness pass and resets completed-task count posture', async () => {
    writeQualification({
      completed_task_count_observed: 4,
      policies: [{ role_id: 'builder', work_class: 'task_construction', completed_task_count_trigger: 3 }],
      records: [{
        qualification_id: 'qual_builder_builder_task_construction',
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
        completed_task_count_at_issue: 0,
      }],
    });

    const result = await qualificationEffectivenessRecordCommand({
      cwd: tempDir,
      agent: 'builder',
      role: 'builder',
      workClass: 'task_construction',
      result: 'pass',
      checkedBy: 'architect',
      evidence: 'verification_run:run_2',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: true,
      check: { result: 'pass', evidence_refs: ['verification_run:run_2'] },
      record: { status: 'qualified', completed_task_count_at_issue: 4 },
      escalation: null,
    });
  });

  it('records effectiveness fail as blocked qualification with CAPA escalation', async () => {
    writeQualification({
      policies: [{ role_id: 'builder', work_class: 'task_construction' }],
      records: [{
        qualification_id: 'qual_builder_builder_task_construction',
        principal_id: 'builder',
        role_id: 'builder',
        work_classes: ['task_construction'],
        status: 'qualified',
      }],
    });

    const result = await qualificationEffectivenessRecordCommand({
      cwd: tempDir,
      agent: 'builder',
      role: 'builder',
      workClass: 'task_construction',
      result: 'fail',
      checkedBy: 'architect',
      evidence: 'review:bad',
      escalationCommand: 'narada inbox submit --kind task_candidate --topic CAPA',
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      record: { status: 'blocked' },
      check: { result: 'fail', escalation_ref: expect.stringContaining('qesc_') },
      escalation: {
        reason: 'qualification_effectiveness_failed',
        command: 'narada inbox submit --kind task_candidate --topic CAPA',
      },
    });
  });

  function writeQualification(value: unknown) {
    writeFileSync(join(tempDir, '.ai', 'site-qualification.json'), `${JSON.stringify(value, null, 2)}\n`);
  }

});
