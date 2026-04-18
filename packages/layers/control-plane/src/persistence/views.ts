import { lstat, mkdir, readdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { NormalizedPayload } from "../types/normalized.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

interface MessageRecordShape {
  message_id?: string;
  conversation_id?: string;
  folder_refs?: string[];
  flags?: {
    is_read?: boolean;
    is_flagged?: boolean;
  };
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export interface FileViewStoreOptions {
  rootDir: string;
}

export class FileViewStore {
  private readonly messagesDir: string;
  private readonly viewsDir: string;
  private readonly byThreadDir: string;
  private readonly byFolderDir: string;
  private readonly unreadDir: string;
  private readonly flaggedDir: string;

  constructor(opts: FileViewStoreOptions) {
    this.messagesDir = join(opts.rootDir, "messages");
    this.viewsDir = join(opts.rootDir, "views");
    this.byThreadDir = join(this.viewsDir, "by-thread");
    this.byFolderDir = join(this.viewsDir, "by-folder");
    this.unreadDir = join(this.viewsDir, "unread");
    this.flaggedDir = join(this.viewsDir, "flagged");
  }

  private messageDir(messageId: string): string {
    return join(this.messagesDir, safeSegment(messageId));
  }

  private async linkMessage(linkPath: string, messageId: string): Promise<void> {
    const target = relative(join(linkPath, ".."), this.messageDir(messageId));

    await this.unlinkMessage(linkPath);
    await symlink(target, linkPath, "dir");
  }

  private async unlinkMessage(linkPath: string): Promise<void> {
    try {
      const entry = await lstat(linkPath);
      if (entry.isSymbolicLink()) {
        await unlink(linkPath);
        return;
      }
      await rm(linkPath, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }

  async markFromPayload(payload: NormalizedPayload): Promise<{
    by_thread: string[];
    by_folder: string[];
    unread_changed: boolean;
    flagged_changed: boolean;
  }> {
    await ensureDir(this.byThreadDir);
    await ensureDir(this.byFolderDir);
    await ensureDir(this.unreadDir);
    await ensureDir(this.flaggedDir);

    const touchedThreads: string[] = [];
    const touchedFolders: string[] = [];

    if (payload.conversation_id) {
      const threadDir = join(
        this.byThreadDir,
        safeSegment(payload.conversation_id),
        "members",
      );
      await ensureDir(threadDir);
      const linkPath = join(threadDir, safeSegment(payload.message_id));
      await this.linkMessage(linkPath, payload.message_id);
      touchedThreads.push(payload.conversation_id);
    }

    for (const folderRef of payload.folder_refs ?? []) {
      const folderDir = join(
        this.byFolderDir,
        safeSegment(folderRef),
        "members",
      );
      await ensureDir(folderDir);
      const linkPath = join(folderDir, safeSegment(payload.message_id));
      await this.linkMessage(linkPath, payload.message_id);
      touchedFolders.push(folderRef);
    }

    const unreadPath = join(this.unreadDir, safeSegment(payload.message_id));
    if (!payload.flags?.is_read) {
      await this.linkMessage(unreadPath, payload.message_id);
    } else {
      await this.unlinkMessage(unreadPath);
    }

    const flaggedPath = join(this.flaggedDir, safeSegment(payload.message_id));
    if (payload.flags?.is_flagged) {
      await this.linkMessage(flaggedPath, payload.message_id);
    } else {
      await this.unlinkMessage(flaggedPath);
    }

    return {
      by_thread: touchedThreads,
      by_folder: touchedFolders,
      unread_changed: true,
      flagged_changed: true,
    };
  }

  async markDelete(messageId: string): Promise<{
    by_thread: string[];
    by_folder: string[];
    unread_changed: boolean;
    flagged_changed: boolean;
  }> {
    await this.unlinkMessage(join(this.unreadDir, safeSegment(messageId)));
    await this.unlinkMessage(join(this.flaggedDir, safeSegment(messageId)));

    return {
      by_thread: [],
      by_folder: [],
      unread_changed: true,
      flagged_changed: true,
    };
  }

  async rebuildAll(): Promise<void> {
    await rm(this.viewsDir, { recursive: true, force: true });
    await ensureDir(this.byThreadDir);
    await ensureDir(this.byFolderDir);
    await ensureDir(this.unreadDir);
    await ensureDir(this.flaggedDir);

    let entries: string[] = [];
    try {
      entries = await readdir(this.messagesDir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const recordPath = join(this.messagesDir, entry, "record.json");

      try {
        const raw = await readFile(recordPath, "utf8");
        const record = JSON.parse(raw) as MessageRecordShape;
        const messageId = record.message_id ?? decodeURIComponent(entry);

        if (record.conversation_id) {
          const threadDir = join(
            this.byThreadDir,
            safeSegment(record.conversation_id),
            "members",
          );
          await ensureDir(threadDir);
          await this.linkMessage(join(threadDir, safeSegment(messageId)), messageId);
        }

        for (const folderRef of record.folder_refs ?? []) {
          const folderDir = join(
            this.byFolderDir,
            safeSegment(folderRef),
            "members",
          );
          await ensureDir(folderDir);
          await this.linkMessage(join(folderDir, safeSegment(messageId)), messageId);
        }

        if (!record.flags?.is_read) {
          await this.linkMessage(join(this.unreadDir, safeSegment(messageId)), messageId);
        }

        if (record.flags?.is_flagged) {
          await this.linkMessage(join(this.flaggedDir, safeSegment(messageId)), messageId);
        }
      } catch {
        // best-effort rebuild; integrity checker handles malformed records
      }
    }

    await writeFile(
      join(this.viewsDir, "_meta.json"),
      `${JSON.stringify({ rebuilt_at: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
  }
}
