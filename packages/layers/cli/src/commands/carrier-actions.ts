import type { CommandContext } from '../lib/command-wrapper.js';
import {
  listCarrierActionDecisions,
  showCarrierActionDecision,
} from '../lib/carrier-action-evidence-reader.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface CarrierActionsListOptions {
  cwd?: string;
  decision?: string;
  limit?: number;
  format?: string;
}

export interface CarrierActionsShowOptions {
  cwd?: string;
  requestId?: string;
  format?: string;
}

export async function carrierActionsListCommand(
  options: CarrierActionsListOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const listed = listCarrierActionDecisions(options.cwd ?? '.', {
    decision: options.decision,
    limit: options.limit ?? 50,
  });
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      ...listed,
      mutation_performed: false,
    },
  };
}

export async function carrierActionsShowCommand(
  options: CarrierActionsShowOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const shown = showCarrierActionDecision(options.cwd ?? '.', options.requestId ?? '');
    if (shown.status === 'not_found') {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          mutation_performed: false,
          request_id: shown.request_id,
          evidence_path: shown.evidence_path,
          error: `Carrier action admission record not found: ${shown.request_id}`,
        },
      };
    }
    if (shown.status === 'unreadable') {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          mutation_performed: false,
          request_id: shown.request_id,
          evidence_path: shown.evidence_path,
          error: shown.error,
        },
      };
    }
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: false,
        evidence_path: shown.evidence_path,
        record: shown.record,
      },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        mutation_performed: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
