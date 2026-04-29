import { resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import {
  checkLawAdmission,
  createLawChange,
  lawChangePath,
  lawReceiptPath,
  listLawChanges,
  listLawReceipts,
  recordLawReceipt,
  unreadLawChanges,
  type LawReceiptStatus,
} from '../lib/law-sync.js';

export interface LawChangeAddOptions {
  cwd?: string;
  issuer?: string;
  summary?: string;
  scope?: string;
  files?: string;
  commit?: string;
  requiredRoles?: string;
  lawSources?: string;
  changeId?: string;
  dryRun?: boolean;
  format?: CliFormat;
}

export interface LawAgentOptions {
  cwd?: string;
  agent?: string;
  role?: string;
  session?: string;
  operatorSurfaceIdentity?: string;
  status?: LawReceiptStatus;
  questionsOrBlockers?: string;
  format?: CliFormat;
}

export interface LawAckOptions extends LawAgentOptions {
  changeId?: string;
}

export interface LawListOptions {
  cwd?: string;
  format?: CliFormat;
}

export async function lawChangeAddCommand(options: LawChangeAddOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!clean(options.issuer)) return errorResult('Missing --issuer');
  if (!clean(options.summary)) return errorResult('Missing --summary');
  const input = {
    issuer: clean(options.issuer)!,
    summary: clean(options.summary)!,
    scope: clean(options.scope) ?? 'site',
    files: splitCsv(options.files),
    commit: clean(options.commit),
    requiredRoles: splitCsv(options.requiredRoles),
    lawSources: splitCsv(options.lawSources),
    changeId: clean(options.changeId) ?? undefined,
  };
  const preview = {
    status: 'success',
    dry_run: Boolean(options.dryRun),
    mutation_performed: !options.dryRun,
    change: {
      ...input,
      requiredRoles: input.requiredRoles.length ? input.requiredRoles : ['*'],
      lawSources: input.lawSources.length ? input.lawSources : undefined,
    },
  };
  if (options.dryRun) {
    return ok(preview, [`Law change preview: ${input.summary}`], options.format);
  }
  const change = await createLawChange(cwd, input);
  return ok({
    status: 'success',
    mutation_performed: true,
    change,
    path: lawChangePath(cwd, change.change_id),
  }, [
    `Law change recorded: ${change.change_id}`,
    `Summary: ${change.summary}`,
    `Required roles: ${change.required_roles.join(', ')}`,
  ], options.format);
}

export async function lawListCommand(options: LawListOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const changes = await listLawChanges(cwd);
  return ok({
    status: 'success',
    count: changes.length,
    changes,
  }, [
    `Law changes: ${changes.length}`,
    ...changes.slice(0, 10).map((change) => `${change.change_id} ${change.summary}`),
  ], options.format);
}

export async function lawUnreadCommand(options: LawAgentOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!clean(options.agent)) return errorResult('Missing --agent');
  const unread = await unreadLawChanges(cwd, clean(options.agent)!, clean(options.role));
  return ok({
    status: 'success',
    agent_id: clean(options.agent),
    role: clean(options.role),
    count: unread.length,
    unread,
  }, [
    `Unread law changes for ${clean(options.agent)}: ${unread.length}`,
    ...unread.slice(0, 10).map((change) => `${change.change_id} ${change.summary}`),
  ], options.format);
}

export async function lawAckCommand(options: LawAckOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!clean(options.changeId)) return errorResult('Missing <change-id>');
  if (!clean(options.agent)) return errorResult('Missing --agent');
  const receipt = await recordLawReceipt(cwd, {
    changeId: clean(options.changeId)!,
    agentId: clean(options.agent)!,
    role: clean(options.role),
    sessionId: clean(options.session),
    operatorSurfaceIdentity: clean(options.operatorSurfaceIdentity),
    status: options.status ?? 'acknowledged',
    questionsOrBlockers: splitCsv(options.questionsOrBlockers),
  });
  return ok({
    status: 'success',
    mutation_performed: true,
    receipt,
    path: lawReceiptPath(cwd, receipt),
  }, [
    `Law receipt recorded: ${receipt.change_id}`,
    `Agent: ${receipt.agent_id}`,
    `Status: ${receipt.status}`,
  ], options.format);
}

export async function lawStatusCommand(options: LawAgentOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!clean(options.agent)) return errorResult('Missing --agent');
  const [changes, receipts, admission] = await Promise.all([
    listLawChanges(cwd),
    listLawReceipts(cwd),
    checkLawAdmission(cwd, clean(options.agent)!, clean(options.role)),
  ]);
  return ok({
    status: 'success',
    agent_id: clean(options.agent),
    role: clean(options.role),
    admission: admission.status,
    unread_count: admission.unread.length,
    change_count: changes.length,
    receipt_count: receipts.filter((receipt) => receipt.agent_id === clean(options.agent)).length,
    unread: admission.unread,
  }, [
    `Law sync for ${clean(options.agent)}: ${admission.status}`,
    `Unread: ${admission.unread.length}`,
  ], options.format);
}

function ok(result: Record<string, unknown>, human: string[], format: CliFormat = 'auto'): { exitCode: ExitCode; result: unknown } {
  return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, human, format) };
}

function errorResult(error: string): { exitCode: ExitCode; result: unknown } {
  return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error } };
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((part) => part.trim()).filter(Boolean);
}

function clean(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
