/**
 * Outbound SQLite Store
 *
 * Durable persistence for outbound commands, versions, transitions,
 * and managed drafts. Uses better-sqlite3.
 */

import Database from "better-sqlite3";
import type {
  OutboundCommand,
  OutboundVersion,
  ManagedDraft,
  OutboundStatus,
  OutboundTransition,
} from "./types.js";

const ACTIVE_UNSENT_STATUSES: readonly OutboundStatus[] = [
  "pending",
  "draft_creating",
  "draft_ready",
  "sending",
  "submitted",
  "retry_wait",
  "blocked_policy",
];

export interface OutboundStore {
  readonly db: import("better-sqlite3").Database;
  initSchema(): void;
  createCommand(command: OutboundCommand, version: OutboundVersion): void;
  getCommandByIdempotencyKey(idempotencyKey: string): OutboundCommand | undefined;
  getCommand(outbound_id: string): OutboundCommand | undefined;
  getCommandStatus(outbound_id: string): OutboundStatus | undefined;
  getLatestVersion(outbound_id: string): OutboundVersion | undefined;
  getVersions(outbound_id: string): OutboundVersion[];
  getActiveCommandsForThread(conversation_id: string): OutboundCommand[];
  supersedePriorVersions(outbound_id: string, newVersion: number): void;
  appendTransition(transition: Omit<OutboundTransition, "id">): void;
  updateCommandStatus(
    outbound_id: string,
    status: OutboundStatus,
    updates?: Partial<Pick<
      OutboundCommand,
      "latest_version" | "blocked_reason" | "terminal_reason" | "submitted_at" | "confirmed_at"
    >>,
  ): void;
  fetchNextEligible(mailbox_id?: string): Array<{ command: OutboundCommand; version: OutboundVersion }>;
  fetchNextByStatus(
    action_type: OutboundCommand["action_type"],
    statuses: OutboundStatus[],
    mailbox_id?: string,
  ): Array<{ command: OutboundCommand; version: OutboundVersion }>;
  setManagedDraft(draft: ManagedDraft): void;
  getManagedDraft(outbound_id: string, version: number): ManagedDraft | undefined;
  close(): void;
}

export interface SqliteOutboundStoreOptions {
  dbPath: string;
}

export interface SqliteOutboundStoreDbOptions {
  db: Database.Database;
}

function rowToCommand(row: Record<string, unknown>): OutboundCommand {
  return {
    outbound_id: String(row.outbound_id),
    conversation_id: String(row.conversation_id),
    mailbox_id: String(row.mailbox_id),
    action_type: String(row.action_type) as OutboundCommand["action_type"],
    status: String(row.status) as OutboundStatus,
    latest_version: Number(row.latest_version),
    created_at: String(row.created_at),
    created_by: String(row.created_by),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
    blocked_reason: row.blocked_reason ? String(row.blocked_reason) : null,
    terminal_reason: row.terminal_reason ? String(row.terminal_reason) : null,
    idempotency_key: String(row.idempotency_key),
  };
}

function rowToVersion(row: Record<string, unknown>): OutboundVersion {
  return {
    outbound_id: String(row.outbound_id),
    version: Number(row.version),
    reply_to_message_id: row.reply_to_message_id ? String(row.reply_to_message_id) : null,
    to: JSON.parse(String(row.to_json)),
    cc: JSON.parse(String(row.cc_json)),
    bcc: JSON.parse(String(row.bcc_json)),
    subject: String(row.subject),
    body_text: String(row.body_text),
    body_html: String(row.body_html),
    idempotency_key: String(row.idempotency_key),
    policy_snapshot_json: String(row.policy_snapshot_json),
    payload_json: String(row.payload_json),
    created_at: String(row.created_at),
    superseded_at: row.superseded_at ? String(row.superseded_at) : null,
  };
}

function rowToManagedDraft(row: Record<string, unknown>): ManagedDraft {
  return {
    outbound_id: String(row.outbound_id),
    version: Number(row.version),
    draft_id: String(row.draft_id),
    etag: row.etag ? String(row.etag) : null,
    internet_message_id: row.internet_message_id ? String(row.internet_message_id) : null,
    header_outbound_id_present: Boolean(row.header_outbound_id_present),
    body_hash: String(row.body_hash),
    recipients_hash: String(row.recipients_hash),
    subject_hash: String(row.subject_hash),
    created_at: String(row.created_at),
    last_verified_at: row.last_verified_at ? String(row.last_verified_at) : null,
    invalidated_reason: row.invalidated_reason ? String(row.invalidated_reason) : null,
  };
}

/**
 * SQLite-backed implementation of the outbound store.
 *
 * Uniqueness of at most one active unsent command per (conversation_id, action_type)
 * is enforced at the application level inside a transaction. This is preferred
 * over a partial unique index because the "active unsent" status set may
 * evolve, and we want explicit error messages and the ability to supersede.
 */
export class SqliteOutboundStore implements OutboundStore {
  readonly db: Database.Database;
  private readonly shouldClose: boolean;

  constructor(opts: SqliteOutboundStoreOptions | SqliteOutboundStoreDbOptions) {
    if ("db" in opts) {
      this.db = opts.db;
      this.shouldClose = false;
    } else {
      this.db = new Database(opts.dbPath);
      this.shouldClose = true;
    }
  }

  initSchema(): void {
    this.db.exec(`
      create table if not exists outbound_commands (
        outbound_id text primary key,
        conversation_id text not null,
        mailbox_id text not null,
        action_type text not null,
        status text not null,
        latest_version integer not null default 1,
        created_at text not null,
        created_by text not null,
        submitted_at text,
        confirmed_at text,
        blocked_reason text,
        terminal_reason text,
        idempotency_key text not null unique
      );

      create index if not exists idx_outbound_commands_status
        on outbound_commands(status);

      create index if not exists idx_outbound_commands_thread_action
        on outbound_commands(conversation_id, action_type);

      create index if not exists idx_outbound_commands_idempotency
        on outbound_commands(idempotency_key);

      create index if not exists idx_outbound_commands_mailbox
        on outbound_commands(mailbox_id);

      create table if not exists outbound_versions (
        outbound_id text not null,
        version integer not null,
        reply_to_message_id text,
        to_json text not null default '[]',
        cc_json text not null default '[]',
        bcc_json text not null default '[]',
        subject text not null default '',
        body_text text not null default '',
        body_html text not null default '',
        idempotency_key text not null,
        policy_snapshot_json text not null default '{}',
        payload_json text not null default '{}',
        created_at text not null,
        superseded_at text,
        primary key (outbound_id, version),
        foreign key (outbound_id) references outbound_commands(outbound_id)
          on delete cascade
      );

      create index if not exists idx_outbound_versions_outbound_id
        on outbound_versions(outbound_id);

      create table if not exists managed_drafts (
        outbound_id text not null,
        version integer not null,
        draft_id text not null,
        etag text,
        internet_message_id text,
        header_outbound_id_present integer not null default 0,
        body_hash text not null,
        recipients_hash text not null,
        subject_hash text not null,
        created_at text not null,
        last_verified_at text,
        invalidated_reason text,
        primary key (outbound_id, version),
        foreign key (outbound_id, version) references outbound_versions(outbound_id, version)
          on delete cascade
      );

      create table if not exists outbound_transitions (
        id integer primary key autoincrement,
        outbound_id text not null,
        version integer,
        from_status text,
        to_status text not null,
        reason text,
        transition_at text not null
      );

      create index if not exists idx_outbound_transitions_outbound_id
        on outbound_transitions(outbound_id);

      create index if not exists idx_outbound_transitions_transition_at
        on outbound_transitions(transition_at);
    `);
  }

  createCommand(command: OutboundCommand, version: OutboundVersion): void {
    const insertCmd = this.db.prepare(`
      insert into outbound_commands (
        outbound_id, conversation_id, mailbox_id, action_type, status,
        latest_version, created_at, created_by, submitted_at,
        confirmed_at, blocked_reason, terminal_reason, idempotency_key
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVer = this.db.prepare(`
      insert into outbound_versions (
        outbound_id, version, reply_to_message_id, to_json, cc_json,
        bcc_json, subject, body_text, body_html, idempotency_key,
        policy_snapshot_json, payload_json, created_at, superseded_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTransition = this.db.prepare(`
      insert into outbound_transitions (
        outbound_id, version, from_status, to_status, reason, transition_at
      ) values (?, ?, ?, ?, ?, ?)
    `);

    const checkIdempotency = this.db.prepare(`
      select outbound_id from outbound_commands where idempotency_key = ?
    `);

    const tx = this.db.transaction(() => {
      const idempotent = checkIdempotency.get(command.idempotency_key) as
        | { outbound_id: string }
        | undefined;
      if (idempotent) {
        // Effect-of-once boundary: identical intent already materialized.
        return;
      }

      insertCmd.run(
        command.outbound_id,
        command.conversation_id,
        command.mailbox_id,
        command.action_type,
        command.status,
        command.latest_version,
        command.created_at,
        command.created_by,
        command.submitted_at,
        command.confirmed_at,
        command.blocked_reason,
        command.terminal_reason,
        command.idempotency_key,
      );

      insertVer.run(
        version.outbound_id,
        version.version,
        version.reply_to_message_id,
        JSON.stringify(version.to),
        JSON.stringify(version.cc),
        JSON.stringify(version.bcc),
        version.subject,
        version.body_text,
        version.body_html,
        version.idempotency_key,
        version.policy_snapshot_json,
        version.payload_json,
        version.created_at,
        version.superseded_at,
      );

      insertTransition.run(
        command.outbound_id,
        version.version,
        null,
        command.status,
        null,
        command.created_at,
      );
    });

    tx();
  }

  getCommandByIdempotencyKey(idempotencyKey: string): OutboundCommand | undefined {
    const row = this.db.prepare(
      "select * from outbound_commands where idempotency_key = ?",
    ).get(idempotencyKey) as Record<string, unknown> | undefined;
    return row ? rowToCommand(row) : undefined;
  }

  getCommand(outbound_id: string): OutboundCommand | undefined {
    const row = this.db.prepare(
      "select * from outbound_commands where outbound_id = ?",
    ).get(outbound_id) as Record<string, unknown> | undefined;
    return row ? rowToCommand(row) : undefined;
  }

  getCommandStatus(outbound_id: string): OutboundStatus | undefined {
    const row = this.db.prepare(
      "select status from outbound_commands where outbound_id = ?",
    ).get(outbound_id) as { status: string } | undefined;
    return row ? (row.status as OutboundStatus) : undefined;
  }

  getLatestVersion(outbound_id: string): OutboundVersion | undefined {
    const row = this.db.prepare(`
      select * from outbound_versions
      where outbound_id = ?
      order by version desc
      limit 1
    `).get(outbound_id) as Record<string, unknown> | undefined;
    return row ? rowToVersion(row) : undefined;
  }

  getVersions(outbound_id: string): OutboundVersion[] {
    const rows = this.db.prepare(`
      select * from outbound_versions
      where outbound_id = ?
      order by version asc
    `).all(outbound_id) as Record<string, unknown>[];
    return rows.map(rowToVersion);
  }

  getActiveCommandsForThread(conversation_id: string): OutboundCommand[] {
    const rows = this.db.prepare(`
      select * from outbound_commands
      where conversation_id = ? and status in (${ACTIVE_UNSENT_STATUSES.map(() => "?").join(", ")})
    `).all(conversation_id, ...ACTIVE_UNSENT_STATUSES) as Record<string, unknown>[];
    return rows.map(rowToCommand);
  }

  supersedePriorVersions(outbound_id: string, newVersion: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      update outbound_versions
      set superseded_at = ?
      where outbound_id = ? and version < ? and superseded_at is null
    `).run(now, outbound_id, newVersion);
  }

  appendTransition(transition: Omit<OutboundTransition, "id">): void {
    this.db.prepare(`
      insert into outbound_transitions (
        outbound_id, version, from_status, to_status, reason, transition_at
      ) values (?, ?, ?, ?, ?, ?)
    `).run(
      transition.outbound_id,
      transition.version ?? null,
      transition.from_status ?? null,
      transition.to_status,
      transition.reason ?? null,
      transition.transition_at,
    );
  }

  updateCommandStatus(
    outbound_id: string,
    status: OutboundStatus,
    updates?: Partial<Pick<
      OutboundCommand,
      "latest_version" | "blocked_reason" | "terminal_reason" | "submitted_at" | "confirmed_at"
    >>,
  ): void {
    const fields: string[] = ["status = ?"];
    const values: (string | number | null)[] = [status];

    if (updates?.latest_version !== undefined) {
      fields.push("latest_version = ?");
      values.push(updates.latest_version);
    }
    if (updates?.blocked_reason !== undefined) {
      fields.push("blocked_reason = ?");
      values.push(updates.blocked_reason);
    }
    if (updates?.terminal_reason !== undefined) {
      fields.push("terminal_reason = ?");
      values.push(updates.terminal_reason);
    }
    if (updates?.submitted_at !== undefined) {
      fields.push("submitted_at = ?");
      values.push(updates.submitted_at);
    }
    if (updates?.confirmed_at !== undefined) {
      fields.push("confirmed_at = ?");
      values.push(updates.confirmed_at);
    }

    values.push(outbound_id);

    this.db.prepare(
      `update outbound_commands set ${fields.join(", ")} where outbound_id = ?`,
    ).run(...values);
  }

  fetchNextEligible(mailbox_id?: string): Array<{ command: OutboundCommand; version: OutboundVersion }> {
    return this.fetchNextByStatus("send_reply", ["draft_ready"], mailbox_id);
  }

  fetchNextByStatus(
    action_type: OutboundCommand["action_type"],
    statuses: OutboundStatus[],
    mailbox_id?: string,
  ): Array<{ command: OutboundCommand; version: OutboundVersion }> {
    if (statuses.length === 0) return [];
    const mailboxFilter = mailbox_id ? "and c.mailbox_id = ?" : "";
    const statusPlaceholders = statuses.map(() => "?").join(", ");
    const sql = `
      select c.*, v.*
      from outbound_commands c
      join outbound_versions v
        on c.outbound_id = v.outbound_id
       and c.latest_version = v.version
      where c.action_type = ?
        and c.status in (${statusPlaceholders})
        and v.superseded_at is null
        ${mailboxFilter}
      order by c.created_at asc
    `;

    const params: (string | number | null)[] = [action_type, ...statuses];
    if (mailbox_id) params.push(mailbox_id);

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];

    return rows.map((row) => ({
      command: rowToCommand(row),
      version: rowToVersion(row),
    }));
  }

  setManagedDraft(draft: ManagedDraft): void {
    this.db.prepare(`
      insert into managed_drafts (
        outbound_id, version, draft_id, etag, internet_message_id,
        header_outbound_id_present, body_hash, recipients_hash, subject_hash,
        created_at, last_verified_at, invalidated_reason
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(outbound_id, version) do update set
        draft_id = excluded.draft_id,
        etag = excluded.etag,
        internet_message_id = excluded.internet_message_id,
        header_outbound_id_present = excluded.header_outbound_id_present,
        body_hash = excluded.body_hash,
        recipients_hash = excluded.recipients_hash,
        subject_hash = excluded.subject_hash,
        last_verified_at = excluded.last_verified_at,
        invalidated_reason = excluded.invalidated_reason
    `).run(
      draft.outbound_id,
      draft.version,
      draft.draft_id,
      draft.etag,
      draft.internet_message_id,
      draft.header_outbound_id_present ? 1 : 0,
      draft.body_hash,
      draft.recipients_hash,
      draft.subject_hash,
      draft.created_at,
      draft.last_verified_at,
      draft.invalidated_reason,
    );
  }

  getManagedDraft(outbound_id: string, version: number): ManagedDraft | undefined {
    const row = this.db.prepare(`
      select * from managed_drafts
      where outbound_id = ? and version = ?
    `).get(outbound_id, version) as Record<string, unknown> | undefined;
    return row ? rowToManagedDraft(row) : undefined;
  }

  close(): void {
    if (this.shouldClose) {
      this.db.close();
    }
  }
}
