import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  canonicalOutboxPath,
  findOutboxItem,
  makeOutboxItem,
  readCanonicalOutbox,
  renderOutboxPreview,
  writeCanonicalOutbox,
} from '../lib/canonical-outbox.js';

export interface OutboxComposeOptions {
  cwd?: string;
  targetKind?: string;
  targetRef?: string;
  transport?: string;
  payloadRef?: string;
  payloadBody?: string;
  authorityLevel?: string;
  principal?: string;
  approvalRequired?: boolean;
  noApprovalRequired?: boolean;
  routeId?: string;
  capabilityGrantId?: string;
  retryOf?: string;
  supersedes?: string;
  by?: string;
  format?: string;
}

export interface OutboxListOptions {
  cwd?: string;
  status?: string;
  targetKind?: string;
  transport?: string;
  limit?: number;
  format?: string;
}

export interface OutboxIdOptions {
  cwd?: string;
  outboxId?: string;
  by?: string;
  evidenceRef?: string;
  confirmationRef?: string;
  reason?: string;
  supersededBy?: string;
  format?: string;
}

export interface OutboxExportOptions {
  cwd?: string;
  outDir?: string;
  status?: string;
  limit?: number;
  format?: string;
}

function requireOption(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizeError(error: unknown): { exitCode: ExitCode; result: unknown } {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: message } };
}

export async function outboxComposeCommand(
  options: OutboxComposeOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const item = makeOutboxItem({
      targetKind: requireOption(options.targetKind, '--target-kind'),
      targetRef: requireOption(options.targetRef, '--target-ref'),
      transport: requireOption(options.transport, '--transport'),
      payloadRef: options.payloadRef,
      payloadBody: options.payloadBody,
      authorityLevel: options.authorityLevel ?? 'operator_confirmed',
      principalId: options.principal,
      approvalRequired: options.noApprovalRequired === true ? false : options.approvalRequired ?? true,
      routeId: options.routeId,
      capabilityGrantId: options.capabilityGrantId,
      retryOf: options.retryOf,
      supersedes: options.supersedes,
      composedBy: requireOption(options.by, '--by'),
    });
    const outbox = await readCanonicalOutbox(cwd);
    outbox.items.push(item);
    const path = await writeCanonicalOutbox(cwd, outbox);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        outbox_path: path,
        item,
        external_mutation_performed: false,
        secret_values_stored: false,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function outboxListCommand(
  options: OutboxListOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const limit = options.limit ?? 20;
  const outbox = await readCanonicalOutbox(cwd);
  const items = outbox.items
    .filter((item) => !options.status || item.status === options.status)
    .filter((item) => !options.targetKind || item.target_kind === options.targetKind)
    .filter((item) => !options.transport || item.transport === options.transport)
    .slice(0, limit);
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      outbox_path: canonicalOutboxPath(cwd),
      count: items.length,
      limit,
      items,
    },
  };
}

export async function outboxShowCommand(
  options: OutboxIdOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const outboxId = requireOption(options.outboxId, '<outbox-id>');
  const cwd = options.cwd ?? '.';
  const outbox = await readCanonicalOutbox(cwd);
  const item = findOutboxItem(outbox, outboxId);
  if (!item) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: `Outbox item not found: ${outboxId}` } };
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      outbox_path: canonicalOutboxPath(cwd),
      item,
    },
  };
}

export async function outboxPreviewCommand(
  options: OutboxIdOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const outboxId = requireOption(options.outboxId, '<outbox-id>');
  const cwd = options.cwd ?? '.';
  const outbox = await readCanonicalOutbox(cwd);
  const item = findOutboxItem(outbox, outboxId);
  if (!item) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: `Outbox item not found: ${outboxId}` } };
  }
  const rendering = renderOutboxPreview(item);
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      outbox_id: item.outbox_id,
      rendering,
      external_mutation_performed: false,
    },
  };
}

async function transitionOutboxItem(
  options: OutboxIdOptions,
  transition: 'approve' | 'confirm' | 'archive' | 'supersede',
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const outboxId = requireOption(options.outboxId, '<outbox-id>');
    const by = requireOption(options.by, '--by');
    const cwd = options.cwd ?? '.';
    const outbox = await readCanonicalOutbox(cwd);
    const item = findOutboxItem(outbox, outboxId);
    if (!item) {
      return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: `Outbox item not found: ${outboxId}` } };
    }
    const now = new Date().toISOString();
    if (transition === 'approve') {
      item.status = 'approved';
      item.approved_by = by;
      item.approved_at = now;
    } else if (transition === 'confirm') {
      item.status = 'confirmed';
      item.execution_evidence_ref = options.evidenceRef ?? item.execution_evidence_ref;
      item.delivery_confirmation_ref = requireOption(options.confirmationRef, '--confirmation-ref');
    } else if (transition === 'archive') {
      item.status = 'archived';
      item.archived_by = by;
      item.archived_at = now;
      item.archive_reason = options.reason ?? null;
    } else {
      item.status = 'superseded';
      item.superseded_by = requireOption(options.supersededBy, '--superseded-by');
    }
    item.updated_at = now;
    const path = await writeCanonicalOutbox(cwd, outbox);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        external_mutation_performed: false,
        outbox_path: path,
        item,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export const outboxApproveCommand = (options: OutboxIdOptions, _context: CommandContext) => transitionOutboxItem(options, 'approve');
export const outboxConfirmCommand = (options: OutboxIdOptions, _context: CommandContext) => transitionOutboxItem(options, 'confirm');
export const outboxArchiveCommand = (options: OutboxIdOptions, _context: CommandContext) => transitionOutboxItem(options, 'archive');
export const outboxSupersedeCommand = (options: OutboxIdOptions, _context: CommandContext) => transitionOutboxItem(options, 'supersede');

export async function outboxExportCommand(
  options: OutboxExportOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const outDir = resolve(cwd, options.outDir ?? '.ai/outbox-items');
  const outbox = await readCanonicalOutbox(cwd);
  const limit = options.limit ?? 200;
  const items = outbox.items
    .filter((item) => !options.status || item.status === options.status)
    .slice(0, limit);
  await mkdir(outDir, { recursive: true });
  const files: string[] = [];
  for (const item of items) {
    const file = join(outDir, `${item.composed_at.replace(/[:.]/g, '-')}-${item.outbox_id}.json`);
    await writeFile(file, `${JSON.stringify(item, null, 2)}\n`, 'utf8');
    files.push(file);
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: true,
      count: files.length,
      out_dir: outDir,
      files,
    },
  };
}
