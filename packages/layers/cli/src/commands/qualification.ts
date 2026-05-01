import { resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import type { CliFormat } from '../lib/cli-output.js';
import { evaluateSiteQualification } from '../lib/site-qualification.js';
import { checkLawAdmission } from '../lib/law-sync.js';

export interface QualificationStatusOptions {
  agent?: string;
  role?: string;
  workClass?: string;
  cwd?: string;
  format?: CliFormat;
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
