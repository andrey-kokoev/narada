#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGovernedCommandSync } from '@narada-core/process-launch-posture';

const __dirname: any = dirname(fileURLToPath(import.meta.url));
const siteRoot: any = resolve(__dirname, '../..');
const DEFAULT_SCOPE_PATH: any = resolve(__dirname, 'scopes/andrey-kokoev-user-correspondence.json');
const MUTATING_GRAPH_PATTERNS: any = /\b(New|Set|Update|Remove|Delete|Send|Move|Copy|Invoke)-Mg|\bMail\.Send\b|\bSend-Mg/i;

export function parseArgs(argv: any) : any{
  const args: any = {
    mode: 'dry-run',
    provider: 'fixture',
    scopePath: DEFAULT_SCOPE_PATH,
    limit: 25,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg: any = argv[index];
    if (arg === '--dry-run') args.mode = 'dry-run';
    else if (arg === '--live') args.mode = 'live';
    else if (arg === '--rebuild') args.rebuild = true;
    else if (arg === '--scope') args.scopePath = argv[++index];
    else if (arg === '--provider') args.provider = argv[++index];
    else if (arg === '--fixture') args.fixturePath = argv[++index];
    else if (arg === '--runtime-root') args.runtimeRoot = argv[++index];
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg === '--mailbox') args.mailboxId = argv[++index];
    else if (arg === '--help') args.help = true;
    else throw new Error(`unknown_argument: ${arg}`);
  }
  return args;
}

export function usage() : any{
  return [
    'Usage: node tools/mailbox-sync/graph-sync.ts [--dry-run|--live] [--provider fixture|graph-powershell] [options]',
    '',
    'Options:',
    '  --scope <path>          Scope config JSON. Defaults to the inert Andrey Graph scope.',
    '  --fixture <path>        Synthetic adapter payload for fixture provider.',
    '  --runtime-root <path>   Runtime root override. Defaults to scope runtime_root.',
    '  --limit <n>             Per-folder message/event bound. Default 25.',
    '  --mailbox <address>     Graph mailbox override for read-side provider invocation.',
    '  --rebuild               Live mode resets rebuildable records for the scope before writing.',
  ].join('\n');
}

export function loadJson(path: any) : any{
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadScope(scopePath: any, scopeId: any = null) : any{
  const scope: any = loadJson(resolve(siteRoot, scopePath));
  return normalizeScope(selectScope(scope, scopeId));
}

export function assertNoOutboundActions(actions: any) : any{
  const blocked: any = new Set(['send', 'draft', 'archive', 'delete', 'move', 'label', 'calendar_write', 'mailbox_mutation']);
  const requested: any = Array.isArray(actions) ? actions : [actions];
  const forbidden: any = requested.filter((action: any) => blocked.has(String(action).toLowerCase()));
  if (forbidden.length > 0) throw new Error(`outbound_or_mutation_action_refused: ${forbidden.join(',')}`);
}

export function assertReadOnlyGraphCommand(command: any) : any{
  if (MUTATING_GRAPH_PATTERNS.test(command)) throw new Error('graph_mutation_command_refused');
}

function stableRef(value: any) : any{
  return String(value ?? 'missing').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
}

function normalizeSubject(subject: any) : any{
  return String(subject ?? '').replace(/^(re|fw|fwd):\s*/i, '').trim().toLowerCase();
}

function normalizeParticipants(value: any) : any{
  if (!value) return [];
  const list: any = Array.isArray(value) ? value : [value];
  return list.map((entry: any) => {
    const email: any = entry.emailAddress ?? entry.email_address ?? entry;
    if (typeof email === 'string') return { address: email.toLowerCase() };
    return {
      name: email.name ?? null,
      address: String(email.address ?? '').toLowerCase(),
    };
  }).filter((entry: any) => entry.address);
}

export function normalizeGraphMessage(raw: any, scope: any, folderRef: any, syncedAt: any) : any{
  const providerId: any = raw.id ?? raw.provider_message_id;
  if (!providerId) throw new Error('message_provider_id_required');
  return {
    schema: 'mailbox_message.v0',
    record_kind: 'message',
    provider: 'microsoft_graph',
    scope_id: scope.scope_id,
    mailbox_id: scope.mailbox_id,
    folder_ref: folderRef ?? raw.parentFolderId ?? raw.folder_ref ?? null,
    provider_message_id: String(providerId),
    immutable_id: raw.internetMessageId ?? raw.immutable_id ?? null,
    conversation_id: raw.conversationId ?? raw.conversation_id ?? null,
    subject: raw.subject ?? '',
    normalized_subject: normalizeSubject(raw.subject),
    sent_at: raw.sentDateTime ?? raw.sent_at ?? null,
    received_at: raw.receivedDateTime ?? raw.received_at ?? null,
    participants: {
      from: normalizeParticipants(raw.from),
      sender: normalizeParticipants(raw.sender),
      to: normalizeParticipants(raw.toRecipients ?? raw.to),
      cc: normalizeParticipants(raw.ccRecipients ?? raw.cc),
      bcc: normalizeParticipants(raw.bccRecipients ?? raw.bcc),
      reply_to: normalizeParticipants(raw.replyTo ?? raw.reply_to),
    },
    body_preview: raw.bodyPreview ?? raw.body_preview ?? '',
    body_text: typeof raw.body?.content === 'string' && scope.normalization?.body === 'text' ? raw.body.content : null,
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map((item: any) => ({
      name: item.name ?? null,
      content_type: item.contentType ?? item.content_type ?? null,
      size: item.size ?? null,
      is_inline: Boolean(item.isInline ?? item.is_inline),
    })) : [],
    tombstone: Boolean(raw.tombstone ?? raw.deleted),
    provenance: { provider_record: 'graph_message', sync_adapter: 'tools/mailbox-sync/graph-sync.ts' },
    synced_at: syncedAt,
  };
}

export function normalizeGraphEvent(raw: any, scope: any, syncedAt: any) : any{
  const providerId: any = raw.id ?? raw.provider_event_id;
  if (!providerId) throw new Error('event_provider_id_required');
  return {
    schema: 'mailbox_event.v0',
    record_kind: 'event',
    provider: 'microsoft_graph',
    scope_id: scope.scope_id,
    mailbox_id: scope.mailbox_id,
    provider_event_id: String(providerId),
    subject: raw.subject ?? '',
    normalized_subject: normalizeSubject(raw.subject),
    start_at: raw.start?.dateTime ?? raw.start_at ?? null,
    end_at: raw.end?.dateTime ?? raw.end_at ?? null,
    organizer: normalizeParticipants(raw.organizer),
    attendees: normalizeParticipants(raw.attendees),
    body_preview: raw.bodyPreview ?? raw.body_preview ?? '',
    tombstone: Boolean(raw.tombstone ?? raw.deleted),
    provenance: { provider_record: 'graph_event', sync_adapter: 'tools/mailbox-sync/graph-sync.ts' },
    synced_at: syncedAt,
  };
}

function readFixtureProvider(fixturePath: any) : any{
  if (!fixturePath) throw new Error('fixture_path_required_for_fixture_provider');
  return loadJson(resolve(siteRoot, fixturePath));
}

function graphPowerShellJson(command: any) : any{
  assertReadOnlyGraphCommand(command);
  const result: any = runGovernedCommandSync('pwsh', ['-NoProfile', '-Command', command], { cwd: siteRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`graph_powershell_failed: ${result.stderr.trim()}`);
  const text: any = result.stdout.trim();
  if (!text) return [];
  const parsed: any = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function readGraphPowerShellProvider(scope: any, limit: any, mailboxOverride: any) : any{
  const mailbox: any = mailboxOverride ?? scope.mailbox_id;
  const folders: any = scope.folders ?? [];
  const messages: any = [];
  for (const folder of folders) {
    const folderId: any = folder.provider_ref ?? folder.ref ?? folder;
    const command: any = `Get-MgUserMailFolderMessage -UserId '${mailbox}' -MailFolderId '${folderId}' -Top ${limit} -Property id,subject,conversationId,receivedDateTime,sentDateTime,from,sender,toRecipients,ccRecipients,bccRecipients,replyTo,bodyPreview,internetMessageId,parentFolderId | ConvertTo-Json -Depth 12`;
    for (const message of graphPowerShellJson(command)) messages.push({ ...message, folder_ref: folderId });
  }
  const eventCommand: any = `Get-MgUserEvent -UserId '${mailbox}' -Top ${limit} -Property id,subject,start,end,organizer,attendees,bodyPreview | ConvertTo-Json -Depth 12`;
  return { messages, events: graphPowerShellJson(eventCommand), tombstones: [] };
}

function ensureWritableRuntime(scopeRoot: any, rebuild: any) : any{
  if (existsSync(join(scopeRoot, 'control', 'DISABLED'))) throw new Error('mailbox_scope_disabled');
  if (existsSync(join(scopeRoot, 'control', 'PAUSED'))) throw new Error('mailbox_scope_paused');
  mkdirSync(join(scopeRoot, 'locks'), { recursive: true });
  const lockPath: any = join(scopeRoot, 'locks', 'sync.lock');
  if (existsSync(lockPath)) throw new Error(`mailbox_sync_lock_present: ${lockPath}`);
  writeFileSync(lockPath, JSON.stringify({ created_at: new Date().toISOString(), pid: process.pid }, null, 2), 'utf8');
  if (rebuild) {
    for (const child of ['messages', 'events', 'tombstones', 'state', 'runs']) {
      rmSync(join(scopeRoot, child), { recursive: true, force: true });
    }
  }
  return lockPath;
}

function writeRecord(path: any, record: any) : any{
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function summarize(records: any) : any{
  return {
    total: records.length,
    tombstones: records.filter((item: any) => item.tombstone).length,
    latest_message_received_at: records.filter((item: any) => item.record_kind === 'message').map((item: any) => item.received_at).filter(Boolean).sort().at(-1) ?? null,
    latest_event_start_at: records.filter((item: any) => item.record_kind === 'event').map((item: any) => item.start_at).filter(Boolean).sort().at(-1) ?? null,
  };
}

export function runMailboxSync(options: any) : any{
  const scope: any = loadScope(options.scopePath ?? DEFAULT_SCOPE_PATH, options.scopeId);
  const runtimeRoot: any = resolve(siteRoot, options.runtimeRoot ?? scope.runtime_root);
  const scopeRoot: any = resolveScopeRoot(runtimeRoot, scope.scope_id);
  const syncedAt: any = new Date().toISOString();
  const limit: any = Number.isFinite(options.limit) ? options.limit : 25;

  const providerPayload: any = options.provider === 'graph-powershell'
    ? readGraphPowerShellProvider(scope, limit, options.mailboxId)
    : readFixtureProvider(options.fixturePath);

  const messages: any = [];
  for (const folder of scope.folders ?? []) {
    const folderRef: any = folder.provider_ref ?? folder.ref ?? folder;
    const folderMessages: any = (providerPayload.messages ?? []).filter((message: any) => !message.folder_ref || message.folder_ref === folderRef || message.parentFolderId === folderRef).slice(0, limit);
    for (const message of folderMessages) messages.push(normalizeGraphMessage(message, scope, folderRef, syncedAt));
  }
  const events: any = (providerPayload.events ?? []).slice(0, limit).map((event: any) => normalizeGraphEvent(event, scope, syncedAt));
  const tombstones: any = (providerPayload.tombstones ?? []).map((item: any) => ({
    schema: 'mailbox_tombstone.v0',
    provider: 'microsoft_graph',
    scope_id: scope.scope_id,
    mailbox_id: scope.mailbox_id,
    provider_record_id: String(item.id ?? item.provider_record_id),
    record_kind: item.record_kind ?? 'message',
    deleted_at: item.deleted_at ?? syncedAt,
    synced_at: syncedAt,
  }));

  const normalized: any = [...messages, ...events];
  const report: any = {
    schema: 'narada.mailbox_sync.run_report.v0',
    mode: options.mode ?? 'dry-run',
    provider: options.provider ?? 'fixture',
    scope_id: scope.scope_id,
    mailbox_id: scope.mailbox_id,
    runtime_root: runtimeRoot,
    bounded_limit: limit,
    counts: {
      folders: (scope.folders ?? []).length,
      messages: messages.length,
      events: events.length,
      tombstones: tombstones.length,
    },
    cursors: summarize(normalized),
    writes: [],
    refusal_policy: 'outbound_and_mailbox_mutation_refused',
    synced_at: syncedAt,
  };

  if ((options.mode ?? 'dry-run') === 'dry-run') return report;

  const lockPath: any = ensureWritableRuntime(scopeRoot, Boolean(options.rebuild));
  try {
    for (const message of messages) {
      const path: any = join(scopeRoot, 'messages', `${stableRef(message.provider_message_id)}.json`);
      writeRecord(path, message);
      report.writes.push(path);
    }
    for (const event of events) {
      const path: any = join(scopeRoot, 'events', `${stableRef(event.provider_event_id)}.json`);
      writeRecord(path, event);
      report.writes.push(path);
    }
    for (const tombstone of tombstones) {
      const path: any = join(scopeRoot, 'tombstones', `${stableRef(tombstone.provider_record_id)}.json`);
      writeRecord(path, tombstone);
      report.writes.push(path);
    }
    const statePath: any = join(scopeRoot, 'state', 'sync-state.json');
    writeRecord(statePath, {
      schema: 'mailbox_sync_state.v0',
      scope_id: scope.scope_id,
      mailbox_id: scope.mailbox_id,
      last_synced_at: syncedAt,
      cursors: report.cursors,
      provider: options.provider ?? 'fixture',
      rebuild_requested: Boolean(options.rebuild),
    });
    report.writes.push(statePath);
    const runPath: any = join(scopeRoot, 'runs', `${syncedAt.replace(/[:.]/g, '-')}.json`);
    writeRecord(runPath, report);
    report.writes.push(runPath);
  } finally {
    rmSync(lockPath, { force: true });
  }
  return report;
}

function selectScope(scopeFile: any, scopeId: any) : any{
  if (Array.isArray(scopeFile?.scopes)) {
    const selected: any = scopeFile.scopes.find((scope: any) => !scopeId || scope.scope_id === scopeId);
    if (!selected) throw new Error(`scope_id_not_found: ${scopeId ?? '<default>'}`);
    return selected;
  }
  return scopeFile;
}

function normalizeScope(scope: any) : any{
  const provider: any = scope.provider === 'microsoft_graph_powershell_delegated'
    ? 'microsoft_graph'
    : scope.provider;
  if (provider !== 'microsoft_graph') throw new Error(`unsupported_provider: ${scope.provider}`);
  if (!scope.scope_id) throw new Error('scope_id_required');
  if (!scope.mailbox_id) throw new Error('mailbox_id_required');
  if (!scope.runtime_root) throw new Error('runtime_root_required');
  assertNoOutboundActions([
    ...(scope.policy?.allowed_actions ?? []),
    ...(scope.policy?.allowed_actions_before_activation ?? []),
    ...(scope.policy?.allowed_actions_after_activation ?? []),
  ]);
  return {
    ...scope,
    provider,
    folders: normalizeFolders(scope.folders),
    normalization: normalizeNormalization(scope.normalization),
  };
}

function normalizeFolders(folders: any) : any{
  return (Array.isArray(folders) ? folders : []).map((folder: any) => {
    if (typeof folder === 'string') return { ref: folder, provider_ref: folder };
    return folder;
  });
}

function normalizeNormalization(normalization: any = {}) : any{
  if (normalization.body) return normalization;
  if (normalization.body_policy === 'read_text_body_by_policy') return { ...normalization, body: 'text' };
  return { ...normalization, body: 'preview_only' };
}

function resolveScopeRoot(runtimeRoot: any, scopeId: any) : any{
  return runtimeRoot.endsWith(scopeId) ? runtimeRoot : join(runtimeRoot, scopeId);
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args: any = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    const report: any = runMailboxSync(args);
    console.log(JSON.stringify(report, null, 2));
  } catch (error: any) {
    console.error(JSON.stringify({ status: 'error', error: error.message }, null, 2));
    process.exit(1);
  }
}
