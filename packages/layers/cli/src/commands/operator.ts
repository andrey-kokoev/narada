import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { assessSiteReadiness, type SiteReadinessPosture, type SiteReadinessResult } from '../lib/site-readiness.js';

export interface OperatorStartOptions {
  site?: string;
  operation?: string;
  role?: string;
  execute?: boolean;
  format?: CliFormat;
}

export type OperatorStartPosture = SiteReadinessPosture;

export interface OperatorStartResult {
  status: 'success' | 'error';
  posture: OperatorStartPosture;
  mutation_performed: false;
  target_locus: {
    site: string;
    site_root: string;
    operation: string | null;
  };
  command_authority: {
    read_only: true;
    mutates_site_state: false;
    execute_requested: boolean;
    execute_supported: false;
  };
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  pending_inbox: Array<{ envelope_id: string; kind: string; title: string | null }>;
  role_binding: {
    role: string;
    identity_id: string | null;
    bound_transport: boolean;
    submit_strategy: string | null;
  };
  readiness: SiteReadinessResult;
  next_command: string;
  bounded_output: true;
}

function requireText(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

export async function operatorStartCommand(
  options: OperatorStartOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const siteInput = requireText(options.site, '--site');
    const role = options.role?.trim() || 'architect';
    const readiness = await assessSiteReadiness({
      site: siteInput,
      operation: options.operation,
      role,
    });

    const result: OperatorStartResult = {
      status: 'success',
      posture: readiness.posture,
      mutation_performed: false,
      target_locus: readiness.target_locus,
      command_authority: {
        read_only: true,
        mutates_site_state: false,
        execute_requested: Boolean(options.execute),
        execute_supported: false,
      },
      checks: readiness.checks.map((check) => ({ name: check.name, ok: check.status !== 'fail', detail: check.message })),
      pending_inbox: readiness.pending_inbox,
      role_binding: {
        role,
        identity_id: readiness.coordinates.operator_surface_posture.identity_id,
        bound_transport: readiness.coordinates.operator_surface_posture.bound_transport,
        submit_strategy: readiness.coordinates.operator_surface_posture.submit_strategy,
      },
      readiness,
      next_command: readiness.next_command,
      bounded_output: true,
    };

    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        mutation_performed: false,
      },
    };
  }
}

function renderHuman(result: OperatorStartResult): string[] {
  return [
    'Operator Start',
    `Site: ${result.target_locus.site_root}`,
    `Posture: ${result.posture}`,
    `Mutation: ${result.mutation_performed ? 'yes' : 'no'}`,
    `Pending inbox: ${result.pending_inbox.length}`,
    `Next: ${result.next_command}`,
  ];
}
