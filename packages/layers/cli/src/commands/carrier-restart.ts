import { requestCarrierRestart, showCarrierRestartOutcome } from '@narada2/site-common-tools/operator-surface/carrier-restart-supervisor';
import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface CarrierRestartOptions {
  siteRoot?: string;
  pcSiteRoot?: string;
  siteId?: string;
  carrierSessionId?: string;
  operationId?: string;
  requestedBy?: string;
  expectedStateJson?: string;
  reason?: string;
  timeoutMs?: number;
  dryRun?: boolean;
  mutatingAuthorized?: string;
  format?: CliFormat;
}

export async function carrierRestartCommand(
  options: CarrierRestartOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const expectedState = parseExpectedState(options.expectedStateJson);
  const outcome = await requestCarrierRestart({
    operation_id: requireOption(options.operationId, '--operation-id'),
    requested_by: requireOption(options.requestedBy, '--requested-by'),
    site_id: requireOption(options.siteId, '--site-id'),
    carrier_session_id: requireOption(options.carrierSessionId, '--carrier-session-id'),
    expected_state: expectedState,
    reason: requireOption(options.reason, '--reason'),
    timeout_ms: options.timeoutMs,
    dry_run: options.dryRun === true,
    mutating_authorized: options.mutatingAuthorized,
  }, {
    siteRoot: options.siteRoot ?? process.cwd(),
    pcSiteRoot: options.pcSiteRoot ?? process.env.NARADA_PC_SITE_ROOT ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2',
  });
  const success = outcome.status === 'completed' || outcome.status === 'planned';
  return {
    exitCode: success ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(outcome, formatCarrierRestart(outcome), options.format ?? 'auto'),
  };
}

export async function carrierRestartOutcomeCommand(
  operationId: string,
  options: Pick<CarrierRestartOptions, 'pcSiteRoot' | 'format'>,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const outcome = showCarrierRestartOutcome(
    options.pcSiteRoot ?? process.env.NARADA_PC_SITE_ROOT ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2',
    requireOption(operationId, '<operation-id>'),
  );
  return {
    exitCode: outcome.status === 'completed' ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(outcome, formatCarrierRestart(outcome), options.format ?? 'auto'),
  };
}

function parseExpectedState(value: string | undefined): Record<string, unknown> {
  if (!value) throw new Error('--expected-state-json is required; pass the bounded observation evidence used for the request.');
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('--expected-state-json must contain a JSON object.');
  return parsed as Record<string, unknown>;
}

function requireOption(value: string | undefined, option: string): string {
  if (!value || value.trim().length === 0) throw new Error(`${option} is required`);
  return value.trim();
}

function formatCarrierRestart(outcome: Record<string, unknown>): string {
  return [
    `Carrier restart: ${outcome.status ?? 'unknown'}`,
    `  operation: ${outcome.operation_id ?? 'unknown'}`,
    `  source: ${outcome.source_session_id ?? 'unknown'}`,
    `  target: ${outcome.target_session_id ?? 'none'}`,
    `  transition: ${outcome.transition_state ?? 'unknown'}`,
    ...(outcome.error_code ? [`  error: ${outcome.error_code}`] : []),
  ].join('\n');
}
