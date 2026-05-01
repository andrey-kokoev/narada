import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateSiteQualification } from '../../src/lib/site-qualification.js';
import { qualificationStatusCommand } from '../../src/commands/qualification.js';
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

  function writeQualification(value: unknown) {
    writeFileSync(join(tempDir, '.ai', 'site-qualification.json'), `${JSON.stringify(value, null, 2)}\n`);
  }

});
