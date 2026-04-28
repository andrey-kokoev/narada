import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type OutboxItemStatus = 'composed' | 'approved' | 'confirmed' | 'archived' | 'superseded';

export interface CanonicalOutboxItem {
  outbox_id: string;
  target_kind: string;
  target_ref: string;
  transport: string;
  payload_ref: string | null;
  payload_body: string | null;
  authority_level: string;
  principal_id: string | null;
  approval_required: boolean;
  approved_by: string | null;
  approved_at: string | null;
  route_id: string | null;
  capability_grant_id: string | null;
  status: OutboxItemStatus;
  dry_run_rendering: string | null;
  execution_evidence_ref: string | null;
  delivery_confirmation_ref: string | null;
  retry_of: string | null;
  supersedes: string | null;
  superseded_by: string | null;
  archived_by: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  composed_by: string;
  composed_at: string;
  updated_at: string;
}

export interface CanonicalOutbox {
  outbox_kind: 'canonical_outbox';
  outbox_version: 1;
  items: CanonicalOutboxItem[];
}

export function canonicalOutboxPath(cwd: string): string {
  return join(resolve(cwd), '.ai', 'canonical-outbox.json');
}

function emptyOutbox(): CanonicalOutbox {
  return {
    outbox_kind: 'canonical_outbox',
    outbox_version: 1,
    items: [],
  };
}

export async function readCanonicalOutbox(cwd: string): Promise<CanonicalOutbox> {
  const path = canonicalOutboxPath(cwd);
  if (!existsSync(path)) return emptyOutbox();
  const parsed = JSON.parse(await readFile(path, 'utf8')) as CanonicalOutbox;
  return {
    outbox_kind: 'canonical_outbox',
    outbox_version: 1,
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

export async function writeCanonicalOutbox(cwd: string, outbox: CanonicalOutbox): Promise<string> {
  const path = canonicalOutboxPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(outbox, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
  return path;
}

export function renderOutboxPreview(item: CanonicalOutboxItem): string {
  const payload = item.payload_body ?? (item.payload_ref ? `[payload-ref:${item.payload_ref}]` : '[empty]');
  return [
    `target=${item.target_kind}:${item.target_ref}`,
    `transport=${item.transport}`,
    `authority=${item.authority_level}`,
    `route=${item.route_id ?? 'unresolved'}`,
    `capability=${item.capability_grant_id ?? 'ungranted'}`,
    `payload=${payload.slice(0, 500)}`,
  ].join('\n');
}

export function makeOutboxItem(args: {
  targetKind: string;
  targetRef: string;
  transport: string;
  payloadRef?: string | null;
  payloadBody?: string | null;
  authorityLevel: string;
  principalId?: string | null;
  approvalRequired?: boolean;
  routeId?: string | null;
  capabilityGrantId?: string | null;
  retryOf?: string | null;
  supersedes?: string | null;
  composedBy: string;
  now?: Date;
}): CanonicalOutboxItem {
  const now = (args.now ?? new Date()).toISOString();
  const item: CanonicalOutboxItem = {
    outbox_id: `out_${randomUUID()}`,
    target_kind: args.targetKind,
    target_ref: args.targetRef,
    transport: args.transport,
    payload_ref: args.payloadRef ?? null,
    payload_body: args.payloadBody ?? null,
    authority_level: args.authorityLevel,
    principal_id: args.principalId ?? null,
    approval_required: args.approvalRequired ?? true,
    approved_by: null,
    approved_at: null,
    route_id: args.routeId ?? null,
    capability_grant_id: args.capabilityGrantId ?? null,
    status: 'composed',
    dry_run_rendering: null,
    execution_evidence_ref: null,
    delivery_confirmation_ref: null,
    retry_of: args.retryOf ?? null,
    supersedes: args.supersedes ?? null,
    superseded_by: null,
    archived_by: null,
    archived_at: null,
    archive_reason: null,
    composed_by: args.composedBy,
    composed_at: now,
    updated_at: now,
  };
  item.dry_run_rendering = renderOutboxPreview(item);
  return item;
}

export function findOutboxItem(outbox: CanonicalOutbox, outboxId: string): CanonicalOutboxItem | undefined {
  return outbox.items.find((item) => item.outbox_id === outboxId);
}
