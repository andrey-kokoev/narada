import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SqliteInboxStore } from '@narada2/control-plane';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { readOperatorSurfaceIdentities } from '../lib/operator-surface-registry.js';

export interface OperatorStartOptions {
  site?: string;
  operation?: string;
  role?: string;
  execute?: boolean;
  format?: CliFormat;
}

export type OperatorStartPosture =
  | 'site_absent'
  | 'initialized_unready'
  | 'ready_missing_role_binding'
  | 'ready_missing_transport'
  | 'ready_pending_inbox'
  | 'fully_idle';

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
  next_command: string;
  bounded_output: true;
}

function requireText(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function titleFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  return typeof record.title === 'string'
    ? record.title
    : typeof record.summary === 'string'
      ? record.summary
      : null;
}

function listPendingInbox(siteRoot: string): OperatorStartResult['pending_inbox'] {
  const dbPath = join(siteRoot, '.ai', 'inbox.db');
  if (!existsSync(dbPath)) return [];
  const store = new SqliteInboxStore(dbPath);
  try {
    return store.list({ status: 'received', limit: 5 }).map((envelope) => ({
      envelope_id: envelope.envelope_id,
      kind: envelope.kind,
      title: titleFromPayload(envelope.payload),
    }));
  } finally {
    store.close();
  }
}

function hasTransport(identity: { input_capabilities?: string[]; submit_strategy?: string } | null): boolean {
  if (!identity) return false;
  const capabilities = identity.input_capabilities ?? [];
  return capabilities.includes('focus') || capabilities.includes('type_text') || Boolean(identity.submit_strategy);
}

function nextCommandFor(posture: OperatorStartPosture, siteRoot: string, role: string): string {
  switch (posture) {
    case 'site_absent':
      return `narada sites init --root ${JSON.stringify(siteRoot)}`;
    case 'initialized_unready':
      return `narada sites doctor ${JSON.stringify(siteRoot)} --format json`;
    case 'ready_missing_role_binding':
      return `narada operator-surface agent instantiate --site ${JSON.stringify(siteRoot)} --role ${role} --agent-kind codex_cli --by <principal>`;
    case 'ready_missing_transport':
      return 'narada operator-surface bind-focused --as self';
    case 'ready_pending_inbox':
      return `narada inbox work-next --by ${role}`;
    case 'fully_idle':
      return `narada work-next --agent ${role} --format json`;
  }
}

export async function operatorStartCommand(
  options: OperatorStartOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const siteInput = requireText(options.site, '--site');
    const role = options.role?.trim() || 'architect';
    const siteRoot = resolve(siteInput);
    const siteExists = existsSync(siteRoot);
    const configExists = existsSync(join(siteRoot, 'config.json'));
    const aiExists = existsSync(join(siteRoot, '.ai'));
    const pendingInbox = siteExists ? listPendingInbox(siteRoot) : [];
    const identities = siteExists ? await readOperatorSurfaceIdentities(siteRoot) : { identities: [] };
    const roleIdentity = identities.identities.find((identity) => identity.role === role) ?? null;

    let posture: OperatorStartPosture;
    if (!siteExists) {
      posture = 'site_absent';
    } else if (!configExists || !aiExists) {
      posture = 'initialized_unready';
    } else if (!roleIdentity) {
      posture = 'ready_missing_role_binding';
    } else if (!hasTransport(roleIdentity)) {
      posture = 'ready_missing_transport';
    } else if (pendingInbox.length > 0) {
      posture = 'ready_pending_inbox';
    } else {
      posture = 'fully_idle';
    }

    const result: OperatorStartResult = {
      status: 'success',
      posture,
      mutation_performed: false,
      target_locus: {
        site: siteInput,
        site_root: siteRoot,
        operation: options.operation?.trim() || null,
      },
      command_authority: {
        read_only: true,
        mutates_site_state: false,
        execute_requested: Boolean(options.execute),
        execute_supported: false,
      },
      checks: [
        { name: 'site_root_exists', ok: siteExists, detail: siteExists ? siteRoot : `missing: ${siteRoot}` },
        { name: 'site_config_exists', ok: configExists, detail: join(siteRoot, 'config.json') },
        { name: 'site_ai_surface_exists', ok: aiExists, detail: join(siteRoot, '.ai') },
        { name: 'role_identity_exists', ok: Boolean(roleIdentity), detail: roleIdentity?.identity_id ?? `missing role identity for ${role}` },
        { name: 'operator_surface_transport_declared', ok: hasTransport(roleIdentity), detail: roleIdentity ? 'transport metadata present' : 'no role identity' },
      ],
      pending_inbox: pendingInbox,
      role_binding: {
        role,
        identity_id: roleIdentity?.identity_id ?? null,
        bound_transport: hasTransport(roleIdentity),
        submit_strategy: roleIdentity?.submit_strategy ?? null,
      },
      next_command: nextCommandFor(posture, siteRoot, role),
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
