import { resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import type { CliFormat } from '../lib/cli-output.js';
import { evaluateSiteQualification, recordQualificationEffectiveness, upsertQualificationRecord } from '../lib/site-qualification.js';
import { checkLawAdmission } from '../lib/law-sync.js';

export interface QualificationStatusOptions {
  agent?: string;
  role?: string;
  workClass?: string;
  cwd?: string;
  format?: CliFormat;
}

export interface QualificationRecordAddOptions extends QualificationStatusOptions {
  site?: string;
  lawSources?: string;
  contextSurfaces?: string;
  evidence?: string;
  issuer?: string;
  admittedBy?: string;
  effectiveAt?: string;
  expiresAt?: string;
  sensitiveWorkAdmitted?: boolean;
  effectivenessInterval?: string;
}

export interface QualificationEffectivenessOptions extends QualificationStatusOptions {
  result?: 'pass' | 'fail';
  checkedBy?: string;
  evidence?: string;
  escalationCommand?: string;
}

export async function qualificationStatusCommand(options: QualificationStatusOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.agent) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--agent is required' } };
  }
  const cwd = resolve(options.cwd ?? process.cwd());
  const workClass = options.workClass ?? 'task_construction';
  const lawAdmission = await checkLawAdmission(cwd, options.agent, options.role);
  const qualification = evaluateSiteQualification({
    cwd,
    principalId: options.agent,
    roleId: options.role,
    workClass,
    lawAdmission,
  });
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      schema: 'https://narada.dev/schemas/site-qualification-status/v1',
      qualification,
      recommended_command: qualification.commands.effectiveness_check
        ?? qualification.commands.absorption
        ?? qualification.commands.receipt
        ?? qualification.commands.repair,
    },
  };
}

export async function qualificationEffectivenessCheckCommand(options: QualificationStatusOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.agent) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--agent is required' } };
  }
  const status = await qualificationStatusCommand(options);
  const result = status.result && typeof status.result === 'object' ? status.result as Record<string, unknown> : {};
  return {
    exitCode: status.exitCode,
    result: {
      ...result,
      command_kind: 'effectiveness_check',
      next_step: 'Record or update Site qualification evidence through the Site governance authority surface; this command is read-only until that mutation surface is implemented.',
    },
  };
}

export async function qualificationRecordAddCommand(options: QualificationRecordAddOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.agent) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--agent is required' } };
  }
  const cwd = resolve(options.cwd ?? process.cwd());
  const workClass = options.workClass ?? 'task_construction';
  const record = upsertQualificationRecord(cwd, {
    site_id: options.site,
    principal_id: options.agent,
    role_id: options.role,
    work_classes: [workClass],
    status: 'qualified',
    law_sources: splitCsv(options.lawSources),
    context_surfaces: splitCsv(options.contextSurfaces),
    evidence_refs: splitCsv(options.evidence),
    issuer: options.issuer,
    admitted_by: options.admittedBy,
    effective_at: options.effectiveAt,
    expires_at: options.expiresAt ?? null,
    sensitive_work_admitted: options.sensitiveWorkAdmitted === true,
    effectiveness_check_completed_task_interval: parsePositiveInt(options.effectivenessInterval),
  });
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: true,
      schema: 'https://narada.dev/schemas/site-qualification-record/v1',
      record,
      evidence_locus: '.ai/site-qualification.json',
    },
  };
}

export async function qualificationEffectivenessRecordCommand(options: QualificationEffectivenessOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.agent) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--agent is required' } };
  }
  if (options.result !== 'pass' && options.result !== 'fail') {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--result pass|fail is required' } };
  }
  const cwd = resolve(options.cwd ?? process.cwd());
  const workClass = options.workClass ?? 'task_construction';
  const recorded = recordQualificationEffectiveness(cwd, {
    principalId: options.agent,
    roleId: options.role,
    workClass,
    result: options.result,
    checkedBy: options.checkedBy ?? options.agent,
    evidenceRefs: splitCsv(options.evidence),
    escalationCommand: options.escalationCommand,
  });
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: true,
      schema: 'https://narada.dev/schemas/site-qualification-effectiveness/v1',
      ...recorded,
      evidence_locus: '.ai/site-qualification.json',
      escalation_command: recorded.escalation?.command ?? null,
    },
  };
}

function splitCsv(value: string | undefined): string[] {
  return typeof value === 'string' && value.trim().length > 0
    ? value.split(',').map((part) => part.trim()).filter(Boolean)
    : [];
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
