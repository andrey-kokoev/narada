import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  type InboxAuthorityLevel,
  type InboxEnvelope,
  type InboxEnvelopeKind,
  type InboxEnvelopeStatus,
  type InboxPromotionTargetKind,
  type InboxSourceKind,
  SqliteInboxStore,
} from '@narada2/control-plane';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { taskCreateCommand } from './task-create.js';

const USER_PC_TEMPLATE_WORKFLOW_REF = 'user-pc-template-materialization-workflow';
const USER_PC_TEMPLATE_WORKFLOW_PATH = 'docs/product/user-pc-template-materialization-workflow.md';

export interface InboxCommandOptions {
  cwd?: string;
  format?: CliFormat;
  store?: SqliteInboxStore;
}

export interface InboxSubmitOptions extends InboxCommandOptions {
  sourceKind?: string;
  sourceRef?: string;
  kind?: string;
  authorityLevel?: string;
  principal?: string;
  payload?: string;
  payloadFile?: string;
  payloadStdin?: boolean;
  stdin?: NodeJS.ReadableStream;
}

export interface InboxListOptions extends InboxCommandOptions {
  status?: string;
  kind?: string;
  limit?: number;
}

export interface InboxShowOptions extends InboxCommandOptions {
  envelopeId?: string;
}

export interface InboxPromoteOptions extends InboxCommandOptions {
  envelopeId?: string;
  targetKind?: string;
  targetRef?: string;
  by?: string;
  title?: string;
  goal?: string;
  criteria?: string[];
}

export interface InboxLeaseOptions extends InboxCommandOptions {
  envelopeId?: string;
  by?: string;
}

export interface InboxNextOptions extends InboxListOptions {}

export interface InboxWorkNextOptions extends InboxNextOptions {
  claim?: boolean;
  by?: string;
}

export interface InboxTriageOptions extends Omit<InboxPromoteOptions, 'targetKind'> {
  action?: string;
  targetKind?: string;
}

export interface InboxPendingOptions extends InboxCommandOptions {
  envelopeId?: string;
  to?: string;
  by?: string;
}

export interface InboxDoctorOptions extends InboxCommandOptions {}

export interface InboxExportOptions extends InboxCommandOptions {
  status?: string;
  kind?: string;
  outDir?: string;
  limit?: number;
}

export interface InboxImportOptions extends InboxCommandOptions {
  fromDir?: string;
}

export async function inboxSubmitCommand(options: InboxSubmitOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const sourceKind = parseSourceKind(options.sourceKind);
  const kind = parseEnvelopeKind(options.kind);
  const authorityLevel = parseAuthorityLevel(options.authorityLevel);
  const sourceRef = options.sourceRef;
  if (!sourceKind || !kind || !authorityLevel || !sourceRef) {
    return errorResult('Missing or invalid --source-kind, --source-ref, --kind, or --authority-level');
  }
  const payloadText = await resolvePayloadText(options);
  if (payloadText instanceof Error) return errorResult(payloadText.message);
  const payload = parsePayload(payloadText);
  if (payload instanceof Error) return errorResult(payload.message);

  return withInboxStoreAsync(options, async (store) => {
    const delivery = inspectInboxDelivery(options.cwd ?? process.cwd());
    const envelope = store.insert({
      envelope_id: `env_${randomUUID()}`,
      received_at: new Date().toISOString(),
      source: { kind: sourceKind, ref: sourceRef },
      kind,
      authority: {
        level: authorityLevel,
        ...(options.principal ? { principal: options.principal } : {}),
      },
      payload,
    });
    return okResult(
      { status: 'success', envelope, delivery },
      [
        `Inbox envelope received: ${envelope.envelope_id}`,
        `Kind: ${envelope.kind}`,
        `Source: ${envelope.source.kind}:${envelope.source.ref}`,
        `Status: ${envelope.status}`,
        `Inbox DB: ${delivery.inbox_db_path}`,
        `Repo: ${delivery.repo_root ?? 'unknown'} @ ${delivery.branch ?? 'unknown'} ${delivery.head_commit ?? 'unknown'}`,
        `Visible on remote: ${delivery.head_matches_remote === true ? 'yes' : delivery.head_matches_remote === false ? 'no' : 'unknown'}`,
      ],
      options.format,
    );
  });
}

export async function inboxDoctorCommand(options: InboxDoctorOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? process.cwd();
  const delivery = inspectInboxDelivery(cwd);
  const readiness = inspectInboxReadiness(cwd, delivery.inbox_db_path);
  const checks = [
    { name: 'repo_detected', ok: delivery.repo_root !== null, detail: delivery.repo_root ?? 'not a git worktree' },
    { name: 'inbox_db_accessible', ok: readiness.inbox_db_accessible, detail: readiness.inbox_db_detail },
    { name: 'sqlite_binding_loaded', ok: readiness.sqlite_binding_loaded, detail: readiness.sqlite_binding_detail },
    { name: 'cli_build_present', ok: readiness.cli_build_present, detail: readiness.cli_build_detail },
  ];
  const ok = checks.every((check) => check.ok);
  return okResult(
    {
      status: 'success',
      ready: ok,
      delivery,
      readiness,
      checks,
    },
    [
      `Inbox doctor: ${ok ? 'ready' : 'attention required'}`,
      `Inbox DB: ${delivery.inbox_db_path}`,
      `Repo: ${delivery.repo_root ?? 'unknown'}`,
      `Branch: ${delivery.branch ?? 'unknown'}`,
      `HEAD: ${delivery.head_commit ?? 'unknown'}`,
      `Remote visibility: ${delivery.head_matches_remote === true ? 'current' : delivery.head_matches_remote === false ? 'not current' : 'unknown'}`,
      ...checks.map((check) => `${check.ok ? 'ok' : 'warn'} ${check.name}: ${check.detail}`),
    ],
    options.format,
  );
}

export async function inboxExportCommand(options: InboxExportOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = options.status ? parseStatus(options.status) : undefined;
  const kind = options.kind ? parseEnvelopeKind(options.kind) : undefined;
  if (options.status && !status) return errorResult(`Invalid status: ${options.status}`);
  if (options.kind && !kind) return errorResult(`Invalid kind: ${options.kind}`);
  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(cwd, options.outDir ?? join('.ai', 'inbox-envelopes'));
  return withInboxStoreAsync(options, async (store) => {
    const envelopes = selectEnvelopes(store, { status, kind, limit: options.limit ?? 200 });
    await mkdir(outDir, { recursive: true });
    const files: string[] = [];
    for (const envelope of envelopes) {
      const fileName = `${envelope.received_at.replace(/[:.]/g, '-')}-${envelope.envelope_id}.json`;
      const path = join(outDir, fileName);
      await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
      files.push(path);
    }
    return okResult(
      {
        status: 'success',
        count: envelopes.length,
        out_dir: outDir,
        files,
      },
      [
        `Inbox envelopes exported: ${envelopes.length}`,
        `Output: ${outDir}`,
      ],
      options.format,
    );
  });
}

export async function inboxImportCommand(options: InboxImportOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? process.cwd();
  const fromDir = resolve(cwd, options.fromDir ?? join('.ai', 'inbox-envelopes'));
  return withInboxStoreAsync(options, async (store) => {
    let names: string[];
    try {
      names = (await readdir(fromDir)).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to read inbox import directory: ${message}`);
    }
    let imported = 0;
    let skipped = 0;
    const files: string[] = [];
    for (const name of names) {
      const path = join(fromDir, name);
      const parsed = parsePayload(await readFile(path, 'utf8'));
      if (parsed instanceof Error) return errorResult(`Invalid exported envelope ${name}: ${parsed.message}`);
      const envelope = parsed as InboxEnvelope;
      if (!isValidExportedEnvelope(envelope)) return errorResult(`Invalid exported envelope shape: ${name}`);
      if (store.get(envelope.envelope_id)) {
        skipped += 1;
        continue;
      }
      const inserted = store.insert({
        envelope_id: envelope.envelope_id,
        received_at: envelope.received_at,
        source: envelope.source,
        kind: envelope.kind,
        authority: envelope.authority,
        payload: envelope.payload,
      });
      if (envelope.status === 'archived') {
        store.archive(inserted.envelope_id, envelope.promotion ?? {
          target_kind: 'archive',
          target_ref: `archive:${inserted.envelope_id}`,
          promoted_at: new Date().toISOString(),
          promoted_by: 'inbox import',
          enactment_status: 'recorded',
          note: 'Imported archived envelope without original promotion metadata.',
        });
      } else if (envelope.status === 'promoted' && envelope.promotion) {
        store.promote(inserted.envelope_id, envelope.promotion);
      }
      imported += 1;
      files.push(path);
    }
    return okResult(
      {
        status: 'success',
        imported,
        skipped,
        from_dir: fromDir,
        files,
      },
      [
        `Inbox envelopes imported: ${imported}`,
        `Skipped existing: ${skipped}`,
        `Source: ${fromDir}`,
      ],
      options.format,
    );
  });
}

export async function inboxListCommand(options: InboxListOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = options.status ? parseStatus(options.status) : undefined;
  const kind = options.kind ? parseEnvelopeKind(options.kind) : undefined;
  if (options.status && !status) return errorResult(`Invalid status: ${options.status}`);
  if (options.kind && !kind) return errorResult(`Invalid kind: ${options.kind}`);
  return withInboxStoreAsync(options, async (store) => {
    const envelopes = selectEnvelopes(store, { status, kind, limit: options.limit });
    return okResult(
      { status: 'success', count: envelopes.length, envelopes },
      [
        `Inbox envelopes: ${envelopes.length}`,
        ...envelopes.map((envelope: { envelope_id: string; status: string; kind: string; source: { kind: string; ref: string } }) =>
          `${envelope.envelope_id}  ${envelope.status}  ${envelope.kind}  ${envelope.source.kind}:${envelope.source.ref}`),
      ],
      options.format,
    );
  });
}

export async function inboxNextCommand(options: InboxNextOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = options.status ? parseStatus(options.status) : 'received';
  const kind = options.kind ? parseEnvelopeKind(options.kind) : undefined;
  if (options.status && !status) return errorResult(`Invalid status: ${options.status}`);
  if (options.kind && !kind) return errorResult(`Invalid kind: ${options.kind}`);

  return withInboxStoreAsync(options, async (store) => {
    const limit = clampLimit(options.limit ?? 5);
    const envelopes = selectEnvelopes(store, { status, kind, limit });
    const [primary, ...alternatives] = envelopes;
    return okResult(
      {
        status: 'success',
        primary: primary ?? null,
        alternatives,
        count: envelopes.length,
      },
      primary
        ? [
          `Next inbox envelope: ${primary.envelope_id}`,
          `Kind: ${primary.kind}`,
          `Source: ${primary.source.kind}:${primary.source.ref}`,
          `Alternatives: ${alternatives.length}`,
        ]
        : ['No matching inbox envelopes.'],
      options.format,
    );
  });
}

export async function inboxWorkNextCommand(options: InboxWorkNextOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = options.status ? parseStatus(options.status) : 'received';
  const kind = options.kind ? parseEnvelopeKind(options.kind) : undefined;
  if (options.status && !status) return errorResult(`Invalid status: ${options.status}`);
  if (options.kind && !kind) return errorResult(`Invalid kind: ${options.kind}`);

  if (options.claim && !options.by) return errorResult('--by is required with --claim');

  return withInboxStoreAsync(options, async (store) => {
    const limit = clampLimit(options.limit ?? 5);
    const envelopes = selectEnvelopes(store, { status, kind, limit });
    const [selected, ...alternatives] = envelopes;
    let primary = selected ?? null;
    if (primary && options.claim) {
      try {
        primary = store.claim(primary.envelope_id, {
          handled_by: options.by!,
          claimed_at: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    }
    const admissibleActions = primary ? admissibleActionsForEnvelope(primary) : [];
    return okResult(
      {
        status: 'success',
        primary: primary ?? null,
        admissible_actions: admissibleActions,
        alternatives,
        alternatives_count: alternatives.length,
      },
      primary
        ? [
          `Next inbox work: ${primary.envelope_id}`,
          `Kind: ${primary.kind}`,
          `Admissible actions: ${admissibleActions.map((action) => action.action).join(', ') || 'none'}`,
          `Alternatives: ${alternatives.length}`,
        ]
        : ['No matching inbox work.'],
      options.format,
    );
  });
}

export async function inboxShowCommand(options: InboxShowOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.envelopeId) return errorResult('Missing envelope ID');
  return withInboxStoreAsync(options, async (store) => {
    const envelope = store.get(options.envelopeId!);
    if (!envelope) return errorResult(`Inbox envelope not found: ${options.envelopeId}`);
    return okResult(
      { status: 'success', envelope },
      [
        `Inbox envelope: ${envelope.envelope_id}`,
        `Status: ${envelope.status}`,
        `Kind: ${envelope.kind}`,
        `Source: ${envelope.source.kind}:${envelope.source.ref}`,
        `Authority: ${envelope.authority.level}${envelope.authority.principal ? ` (${envelope.authority.principal})` : ''}`,
        `Promotion: ${envelope.promotion ? `${envelope.promotion.target_kind}:${envelope.promotion.target_ref}` : 'none'}`,
      ],
      options.format,
    );
  });
}

export async function inboxClaimCommand(options: InboxLeaseOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.envelopeId || !options.by) return errorResult('Missing envelope ID or --by');
  return withInboxStoreAsync(options, async (store) => {
    try {
      const envelope = store.claim(options.envelopeId!, {
        handled_by: options.by!,
        claimed_at: new Date().toISOString(),
      });
      return okResult(
        { status: 'success', envelope },
        [`Inbox envelope claimed: ${envelope.envelope_id}`, `Handled by: ${options.by}`],
        options.format,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  });
}

export async function inboxReleaseCommand(options: InboxLeaseOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.envelopeId || !options.by) return errorResult('Missing envelope ID or --by');
  return withInboxStoreAsync(options, async (store) => {
    try {
      const envelope = store.release(options.envelopeId!, options.by!);
      return okResult(
        { status: 'success', envelope },
        [`Inbox envelope released: ${envelope.envelope_id}`, 'Status: received'],
        options.format,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  });
}

export async function inboxPromoteCommand(options: InboxPromoteOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const targetKind = parsePromotionTargetKind(options.targetKind);
  if (!options.envelopeId || !targetKind || !options.by) {
    return errorResult('Missing or invalid envelope ID, --target-kind, or --by');
  }
  if (targetKind !== 'archive' && targetKind !== 'task' && !options.targetRef) {
    return errorResult('Missing --target-ref for non-archive promotion');
  }
  return withInboxStoreAsync(options, async (store) => {
    const existing = store.get(options.envelopeId!);
    if (!existing) return errorResult(`Inbox envelope not found: ${options.envelopeId}`);
    const canUpgradePendingPromotion =
      existing.promotion?.target_kind === targetKind
      && existing.promotion.target_ref === options.targetRef
      && existing.promotion.enactment_status === 'pending'
      && targetKind === 'site_config_change'
      && options.targetRef === USER_PC_TEMPLATE_WORKFLOW_REF;
    if (existing.promotion?.target_kind === targetKind && !canUpgradePendingPromotion) {
      return okResult(
        {
          status: 'success',
          already_promoted: true,
          enactment_status: existing.promotion.enactment_status ?? 'recorded',
          envelope: existing,
        },
        [
          `Inbox envelope already promoted: ${existing.envelope_id}`,
          `Target: ${existing.promotion.target_kind}:${existing.promotion.target_ref}`,
          `Enactment: ${existing.promotion.enactment_status ?? 'recorded'}`,
        ],
        options.format,
      );
    }

    try {
      if (targetKind === 'archive') {
        const envelope = store.archive(options.envelopeId!, {
          target_kind: 'archive',
          target_ref: options.targetRef ?? `archive:${options.envelopeId}`,
          promoted_at: new Date().toISOString(),
          promoted_by: options.by!,
          enactment_status: 'recorded',
          note: 'Envelope archived; no target-zone mutation was performed.',
        });
        return okResult(
          {
            status: 'success',
            enactment_status: 'recorded',
            target_mutation: false,
            envelope,
          },
          [
            `Inbox envelope archived: ${envelope.envelope_id}`,
            'Target mutation: none',
            `Promoted by: ${options.by}`,
          ],
          options.format,
        );
      }

      if (targetKind === 'task') {
        const taskResult = await createTaskFromEnvelope(existing, options);
        if (taskResult.exitCode !== ExitCode.SUCCESS) return taskResult;
        const task = taskResult.result as { task_number: number; task_id: string };
        const envelope = store.promote(options.envelopeId!, {
          target_kind: 'task',
          target_ref: `task:${task.task_number}`,
          promoted_at: new Date().toISOString(),
          promoted_by: options.by!,
          enactment_status: 'enacted',
          target_command: 'task create',
          target_result: taskResult.result,
        });
        return okResult(
          {
            status: 'success',
            enactment_status: 'enacted',
            target_mutation: true,
            target: taskResult.result,
            envelope,
          },
          [
            `Inbox envelope promoted: ${envelope.envelope_id}`,
            `Created task: ${task.task_number}`,
            `Promoted by: ${options.by}`,
          ],
          options.format,
        );
      }

      if (targetKind === 'site_config_change' && options.targetRef === USER_PC_TEMPLATE_WORKFLOW_REF) {
        const target = await enactUserPcTemplateMaterializationWorkflow(existing, options);
        const envelope = store.promote(options.envelopeId!, {
          target_kind: 'site_config_change',
          target_ref: USER_PC_TEMPLATE_WORKFLOW_REF,
          promoted_at: new Date().toISOString(),
          promoted_by: options.by!,
          enactment_status: 'enacted',
          target_command: 'site_config_change:user-pc-template-materialization-workflow',
          target_result: target,
        });
        return okResult(
          {
            status: 'success',
            enactment_status: 'enacted',
            target_mutation: target.created,
            target,
            envelope,
          },
          [
            `Inbox envelope enacted: ${envelope.envelope_id}`,
            `Target: site_config_change:${USER_PC_TEMPLATE_WORKFLOW_REF}`,
            `Artifact: ${target.artifact_path}`,
            `Promoted by: ${options.by}`,
          ],
          options.format,
        );
      }

      const envelope = store.promote(options.envelopeId!, {
        target_kind: targetKind,
        target_ref: options.targetRef!,
        promoted_at: new Date().toISOString(),
        promoted_by: options.by!,
        enactment_status: 'pending',
        note: `recorded_pending_crossing: executable promotion for target kind '${targetKind}' is not implemented yet.`,
      });
      return okResult(
        {
          status: 'success',
          enactment_status: 'pending',
          pending_kind: 'recorded_pending_crossing',
          target_mutation: false,
          envelope,
        },
        [
          `Inbox envelope recorded as pending crossing: ${envelope.envelope_id}`,
          `Target: ${targetKind}:${options.targetRef}`,
          'Enactment: pending (not executed)',
          `Promoted by: ${options.by}`,
        ],
        options.format,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  });
}

async function enactUserPcTemplateMaterializationWorkflow(
  envelope: InboxEnvelope,
  options: InboxPromoteOptions,
): Promise<{ artifact_path: string; created: boolean; source_envelope_id: string }> {
  const cwd = options.cwd ?? process.cwd();
  const artifactPath = join(cwd, USER_PC_TEMPLATE_WORKFLOW_PATH);
  let created = false;
  try {
    await access(artifactPath);
  } catch {
    await mkdir(join(cwd, 'docs', 'product'), { recursive: true });
    await writeFile(artifactPath, renderUserPcTemplateMaterializationWorkflow(envelope), 'utf8');
    created = true;
  }
  return {
    artifact_path: USER_PC_TEMPLATE_WORKFLOW_PATH,
    created,
    source_envelope_id: envelope.envelope_id,
  };
}

function renderUserPcTemplateMaterializationWorkflow(envelope: InboxEnvelope): string {
  const payload = envelope.payload && typeof envelope.payload === 'object'
    ? envelope.payload as Record<string, unknown>
    : {};
  const summary = typeof payload.summary === 'string'
    ? payload.summary
    : 'Materialize GitHub-backed User Site PC templates into concrete local PC Sites.';
  const originalEnvelopeId = typeof payload.original_envelope_id === 'string'
    ? payload.original_envelope_id
    : envelope.envelope_id;

  return `# User Site PC Template Materialization Workflow

This workflow materializes User Site PC templates into concrete local PC-locus Sites.

## Source

- Inbox envelope: ${envelope.envelope_id}
- Original branch envelope: ${originalEnvelopeId}
- Source ref: ${envelope.source.kind}:${envelope.source.ref}

## Goal

${summary}

## Workflow

1. Select the User Site template that describes the PC-facing capability.
2. Resolve the target PC identity from explicit Site configuration, not from hostname guesswork alone.
3. Create or update the PC-locus Site under the authority-locus root policy:
   - Windows native PC locus: \`%ProgramData%\\Narada\\sites\\pc\\{site_id}\`
   - WSL or other substrate loci must use their documented Site roots.
4. Materialize the template into the PC Site using sanctioned Site commands and checked-in artifacts.
5. Run \`narada sites doctor <site-id> --authority-locus\` to validate root policy, registry entry, config identity, and lifecycle schema.
6. Record residuals as Canonical Inbox envelopes or task-governance tasks instead of editing Site state directly.

## Authority Rules

- User-locus Sites own operator memory, preferences, and user-scoped tool policy.
- PC-locus Sites own machine/session state such as display topology, services, scheduled tasks, drivers, and recovery actions.
- Template materialization is a Site configuration crossing; it must leave a durable artifact and a validation trace.
- A hostname / COMPUTERNAME mismatch is an observation, not corruption by itself. The configured Site identity remains the authority.

## Completion Signal

The crossing is complete when the concrete PC Site can pass:

\`\`\`bash
narada sites doctor <site-id> --authority-locus
\`\`\`
`;
}

export async function inboxTaskCommand(options: Omit<InboxPromoteOptions, 'targetKind'>): Promise<{ exitCode: ExitCode; result: unknown }> {
  return inboxPromoteCommand({
    ...options,
    targetKind: 'task',
    targetRef: options.targetRef ?? options.title,
  });
}

export async function inboxTriageCommand(options: InboxTriageOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  switch (options.action) {
    case 'archive':
      return inboxPromoteCommand({ ...options, targetKind: 'archive' });
    case 'task':
      return inboxTaskCommand(options);
    case 'pending':
      if (!options.targetKind || options.targetKind === 'task' || options.targetKind === 'archive') {
        return errorResult('--target-kind must be a pending target kind for --action pending');
      }
      if (!options.targetRef) {
        return errorResult('--target-ref is required for --action pending');
      }
      return inboxPromoteCommand(options);
    default:
      return errorResult('--action must be one of: archive, task, pending');
  }
}

export async function inboxPendingCommand(options: InboxPendingOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.to) return errorResult('--to is required as <kind>:<ref>');
  const parsed = parsePendingTo(options.to);
  if (!parsed) return errorResult('--to must be <kind>:<ref>');
  return inboxPromoteCommand({
    ...options,
    targetKind: parsed.targetKind,
    targetRef: parsed.targetRef,
  });
}

function admissibleActionsForEnvelope(envelope: InboxEnvelope): Array<Record<string, unknown>> {
  if (envelope.status !== 'received' && envelope.status !== 'handling') {
    return [];
  }
  const actions: Array<Record<string, unknown>> = [
    {
      action: 'archive',
      command: `narada inbox triage ${envelope.envelope_id} --action archive --by <principal>`,
      command_args: ['inbox', 'triage', envelope.envelope_id, '--action', 'archive', '--by', '<principal>'],
      mutates: true,
      target_mutation: false,
    },
    {
      action: 'pending',
      command: `narada inbox pending ${envelope.envelope_id} --to <kind>:<ref> --by <principal>`,
      command_args: ['inbox', 'pending', envelope.envelope_id, '--to', '<kind>:<ref>', '--by', '<principal>'],
      mutates: true,
      target_mutation: false,
      pending_kind: 'recorded_pending_crossing',
    },
  ];
  if (envelope.kind === 'task_candidate' || envelope.kind === 'upstream_task_candidate') {
    actions.unshift({
      action: 'task',
      command: `narada inbox task ${envelope.envelope_id} --by <principal>`,
      command_args: ['inbox', 'task', envelope.envelope_id, '--by', '<principal>'],
      mutates: true,
      target_mutation: true,
    });
  }
  return actions;
}

function selectEnvelopes(
  store: SqliteInboxStore,
  options: { status?: InboxEnvelopeStatus; kind?: InboxEnvelopeKind; limit?: number },
): InboxEnvelope[] {
  const limit = clampLimit(options.limit ?? 20);
  const scanLimit = options.kind ? 200 : limit;
  return store
    .list({ status: options.status, limit: scanLimit })
    .filter((envelope) => !options.kind || envelope.kind === options.kind)
    .slice(0, limit);
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(limit, 50));
}

async function createTaskFromEnvelope(
  envelope: InboxEnvelope,
  options: InboxPromoteOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (envelope.kind !== 'task_candidate' && envelope.kind !== 'upstream_task_candidate') {
    return errorResult(`Envelope kind '${envelope.kind}' cannot be enacted as task`);
  }

  const payload = asRecord(envelope.payload);
  const title = cleanString(options.title)
    ?? stringField(payload, 'title')
    ?? stringField(payload, 'summary')
    ?? options.targetRef
    ?? `Inbox envelope ${envelope.envelope_id}`;
  const goal = cleanString(options.goal)
    ?? stringField(payload, 'goal')
    ?? stringField(payload, 'description')
    ?? `Promoted from inbox envelope ${envelope.envelope_id}.`;
  const criteria = cleanStringArray(options.criteria)
    ?? stringArrayField(payload, 'acceptance_criteria')
    ?? stringArrayField(payload, 'criteria')
    ?? [`Inbox envelope ${envelope.envelope_id} has been handled.`];

  return taskCreateCommand({
    cwd: options.cwd,
    title,
    goal,
    criteria,
    chapter: stringField(payload, 'chapter') ?? 'Canonical Inbox Promotions',
    dependsOn: numberArrayCsvField(payload, 'depends_on'),
    format: 'json',
  });
}

function withInboxStore(
  options: InboxCommandOptions,
  run: (store: SqliteInboxStore) => { exitCode: ExitCode; result: unknown },
): { exitCode: ExitCode; result: unknown } {
  if (options.store) return run(options.store);
  const store = new SqliteInboxStore(join(options.cwd ?? process.cwd(), '.ai', 'inbox.db'));
  try {
    return run(store);
  } finally {
    store.close();
  }
}

function inspectInboxDelivery(cwdInput: string): Record<string, unknown> {
  const cwd = resolve(cwdInput);
  const repoRoot = git(cwd, ['rev-parse', '--show-toplevel']);
  const branch = repoRoot ? git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']) : null;
  const headCommit = repoRoot ? git(repoRoot, ['rev-parse', 'HEAD']) : null;
  const upstream = repoRoot ? git(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) : null;
  const upstreamCommit = repoRoot && upstream ? git(repoRoot, ['rev-parse', upstream]) : null;
  const dirty = repoRoot ? (git(repoRoot, ['status', '--porcelain']) ?? '').trim().length > 0 : null;
  return {
    cwd,
    repo_root: repoRoot,
    branch,
    head_commit: headCommit,
    upstream,
    upstream_commit: upstreamCommit,
    head_matches_remote: headCommit && upstreamCommit ? headCommit === upstreamCommit : null,
    worktree_dirty: dirty,
    inbox_db_path: join(cwd, '.ai', 'inbox.db'),
    export_dir: join(cwd, '.ai', 'inbox-envelopes'),
    merge_or_replay_required: headCommit && upstreamCommit ? headCommit !== upstreamCommit : null,
    git_conflict_posture: 'local sqlite db ignored; use inbox export/import for portable envelopes',
  };
}

function inspectInboxReadiness(cwdInput: string, inboxDbPath: unknown): Record<string, unknown> {
  const cwd = resolve(cwdInput);
  const inboxPath = String(inboxDbPath);
  let inboxDbAccessible = false;
  let inboxDbDetail = 'not checked';
  try {
    const store = new SqliteInboxStore(inboxPath);
    store.close();
    inboxDbAccessible = true;
    inboxDbDetail = existsSync(inboxPath) ? 'openable' : 'created by doctor';
  } catch (error) {
    inboxDbDetail = error instanceof Error ? error.message : String(error);
  }

  const cliBuildPath = join(cwd, 'packages', 'layers', 'cli', 'dist', 'main.js');
  return {
    inbox_db_accessible: inboxDbAccessible,
    inbox_db_detail: inboxDbDetail,
    sqlite_binding_loaded: true,
    sqlite_binding_detail: 'better-sqlite3 loaded by CLI process',
    cli_build_present: existsSync(cliBuildPath),
    cli_build_detail: existsSync(cliBuildPath) ? cliBuildPath : `${cliBuildPath} missing; run pnpm --filter @narada2/cli build`,
  };
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function withInboxStoreAsync(
  options: InboxCommandOptions,
  run: (store: SqliteInboxStore) => Promise<{ exitCode: ExitCode; result: unknown }>,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (options.store) return run(options.store);
  const store = new SqliteInboxStore(join(options.cwd ?? process.cwd(), '.ai', 'inbox.db'));
  try {
    return await run(store);
  } finally {
    store.close();
  }
}

function okResult(result: Record<string, unknown>, human: string[], format: CliFormat = 'auto'): { exitCode: ExitCode; result: unknown } {
  return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, human, format) };
}

function errorResult(error: string): { exitCode: ExitCode; result: unknown } {
  return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error } };
}

async function resolvePayloadText(options: InboxSubmitOptions): Promise<string | Error> {
  const sources = [
    options.payload !== undefined ? '--payload' : null,
    options.payloadFile ? '--payload-file' : null,
    options.payloadStdin ? '--payload-stdin' : null,
  ].filter(Boolean);
  if (sources.length > 1) {
    return new Error(`Use only one payload source: ${sources.join(', ')}`);
  }
  if (options.payloadFile) {
    try {
      return await readFile(options.payloadFile, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Error(`Failed to read --payload-file: ${message}`);
    }
  }
  if (options.payloadStdin) {
    try {
      return await readStream(options.stdin ?? process.stdin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Error(`Failed to read --payload-stdin: ${message}`);
    }
  }
  return options.payload ?? '{}';
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parsePayload(payload: string | undefined): unknown | Error {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`Invalid JSON payload: ${message}`);
  }
}

function parseSourceKind(value: string | undefined): InboxSourceKind | undefined {
  return oneOf(value, ['user_chat', 'email', 'diagnostic', 'agent_report', 'file_drop', 'cli', 'webhook', 'system_observation']);
}

function parseEnvelopeKind(value: string | undefined): InboxEnvelopeKind | undefined {
  return oneOf(value, ['proposal', 'observation', 'command_request', 'question', 'knowledge_candidate', 'task_candidate', 'incident', 'upstream_task_candidate']);
}

function parseAuthorityLevel(value: string | undefined): InboxAuthorityLevel | undefined {
  return oneOf(value, ['none', 'user_statement', 'operator_confirmed', 'system_observed', 'agent_reported']);
}

function parseStatus(value: string | undefined): InboxEnvelopeStatus | undefined {
  return oneOf(value, ['received', 'handling', 'classified', 'accepted', 'rejected', 'promoted', 'archived', 'superseded']);
}

function parsePromotionTargetKind(value: string | undefined): InboxPromotionTargetKind | undefined {
  return oneOf(value, ['task', 'decision', 'operator_action', 'knowledge_entry', 'site_config_change', 'archive']);
}

function parsePendingTo(value: string): { targetKind: InboxPromotionTargetKind; targetRef: string } | undefined {
  const index = value.indexOf(':');
  if (index <= 0 || index === value.length - 1) return undefined;
  const targetKind = parsePromotionTargetKind(value.slice(0, index));
  if (!targetKind || targetKind === 'task' || targetKind === 'archive') return undefined;
  return { targetKind, targetRef: value.slice(index + 1) };
}

function isValidExportedEnvelope(value: unknown): value is InboxEnvelope {
  const record = asRecord(value);
  return typeof record.envelope_id === 'string'
    && typeof record.received_at === 'string'
    && parseEnvelopeKind(record.kind as string | undefined) !== undefined
    && parseStatus(record.status as string | undefined) !== undefined
    && typeof record.source === 'object'
    && typeof record.payload !== 'undefined';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length > 0 ? strings.map((item) => item.trim()) : undefined;
}

function cleanString(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function cleanStringArray(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const strings = value.filter((item) => item.trim().length > 0).map((item) => item.trim());
  return strings.length > 0 ? strings : undefined;
}

function numberArrayCsvField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const numbers = value
    .map((item) => typeof item === 'number' ? item : Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
  return numbers.length > 0 ? numbers.join(',') : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined;
}
