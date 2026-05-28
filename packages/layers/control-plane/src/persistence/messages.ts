import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type {
  NormalizedAttachment,
  NormalizedAddress,
  NormalizedBody,
  NormalizedPayload,
} from "../types/normalized.js";
import type { MessageStore } from "../projector/apply-event.js";
import { StorageError, CorruptionError, wrapError, ErrorCode } from "../errors.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

function bodyTextFromPayload(payload: NormalizedPayload): string | undefined {
  return payload.body?.text;
}

function bodyHtmlFromPayload(payload: NormalizedPayload): string | undefined {
  return payload.body?.html;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAddresses(value: unknown): value is NormalizedAddress[] {
  return Array.isArray(value) && value.length > 0;
}

function hasAddress(value: unknown): value is NormalizedAddress {
  return Boolean(value && typeof value === "object" && (hasText((value as NormalizedAddress).email) || hasText((value as NormalizedAddress).display_name)));
}

function hasBodyContent(body: NormalizedBody | undefined): boolean {
  return Boolean(body && (hasText(body.text) || hasText(body.html) || hasText(body.preview)));
}

function mergeBody(existing: NormalizedBody | undefined, incoming: NormalizedBody | undefined): NormalizedBody | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (incoming.body_kind === "empty" && hasBodyContent(existing)) {
    return {
      ...incoming,
      body_kind: existing.body_kind,
      ...(existing.text !== undefined ? { text: existing.text } : {}),
      ...(existing.html !== undefined ? { html: existing.html } : {}),
      ...(incoming.preview ?? existing.preview ? { preview: incoming.preview ?? existing.preview } : {}),
      ...(existing.content_hashes ? { content_hashes: existing.content_hashes } : {}),
    };
  }
  return incoming;
}

function mergeGraphExtensions(existing: NormalizedPayload, incoming: NormalizedPayload): NormalizedPayload["source_extensions"] {
  const existingNamespaces = existing.source_extensions?.namespaces ?? {};
  const incomingNamespaces = incoming.source_extensions?.namespaces ?? {};
  const existingGraph = existingNamespaces.graph ?? {};
  const incomingGraph = incomingNamespaces.graph ?? {};
  const graph = { ...existingGraph, ...incomingGraph };
  const namespaces = { ...existingNamespaces, ...incomingNamespaces, ...(Object.keys(graph).length ? { graph } : {}) };
  return Object.keys(namespaces).length ? { namespaces } : undefined;
}

function mergePartialPayload(existing: NormalizedPayload | null, incoming: NormalizedPayload): NormalizedPayload {
  if (!existing || existing.message_id !== incoming.message_id) return incoming;
  const existingWithTimes = existing as NormalizedPayload & {
    sent_at?: string;
    created_at?: string;
    last_modified_at?: string;
  };
  const incomingWithTimes = incoming as NormalizedPayload & {
    sent_at?: string;
    created_at?: string;
    last_modified_at?: string;
  };

  const attachments =
    (incoming.attachments?.length ?? 0) > 0
      ? incoming.attachments
      : (existing.attachments?.length ?? 0) > 0
        ? existing.attachments
        : incoming.attachments;

  const merged: NormalizedPayload = {
    ...existing,
    ...incoming,
    conversation_id: hasText(incoming.conversation_id) ? incoming.conversation_id : existing.conversation_id,
    internet_message_id: hasText(incoming.internet_message_id) ? incoming.internet_message_id : existing.internet_message_id,
    subject: hasText(incoming.subject) ? incoming.subject : existing.subject,
    from: hasAddress(incoming.from) ? incoming.from : existing.from,
    sender: hasAddress(incoming.sender) ? incoming.sender : existing.sender,
    reply_to: hasAddresses(incoming.reply_to) ? incoming.reply_to : existing.reply_to ?? incoming.reply_to,
    to: hasAddresses(incoming.to) ? incoming.to : existing.to ?? incoming.to,
    cc: hasAddresses(incoming.cc) ? incoming.cc : existing.cc ?? incoming.cc,
    bcc: hasAddresses(incoming.bcc) ? incoming.bcc : existing.bcc ?? incoming.bcc,
    received_at: hasText(incoming.received_at) ? incoming.received_at : existing.received_at,
    body: mergeBody(existing.body, incoming.body),
    attachments,
    flags: {
      is_read: incoming.flags?.is_read ?? existing.flags?.is_read ?? false,
      is_draft: incoming.flags?.is_draft ?? existing.flags?.is_draft ?? false,
      is_flagged: incoming.flags?.is_flagged ?? existing.flags?.is_flagged ?? false,
      has_attachments: Boolean(incoming.flags?.has_attachments || existing.flags?.has_attachments || (attachments?.length ?? 0) > 0),
    },
    source_extensions: mergeGraphExtensions(existing, incoming),
  };

  Object.assign(merged, {
    ...(hasText(incomingWithTimes.sent_at) || hasText(existingWithTimes.sent_at)
      ? { sent_at: hasText(incomingWithTimes.sent_at) ? incomingWithTimes.sent_at : existingWithTimes.sent_at }
      : {}),
    ...(hasText(incomingWithTimes.created_at) || hasText(existingWithTimes.created_at)
      ? { created_at: hasText(incomingWithTimes.created_at) ? incomingWithTimes.created_at : existingWithTimes.created_at }
      : {}),
    ...(hasText(incomingWithTimes.last_modified_at) || hasText(existingWithTimes.last_modified_at)
      ? { last_modified_at: hasText(incomingWithTimes.last_modified_at) ? incomingWithTimes.last_modified_at : existingWithTimes.last_modified_at }
      : {}),
  });

  return merged;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path: string, value: string): Promise<void> {
  await writeFile(path, value, "utf8");
}

function buildAttachmentManifest(
  attachments: NormalizedAttachment[],
): Array<Record<string, unknown>> {
  return attachments.map((attachment) => ({
    attachment_key: attachment.attachment_key,
    ...(attachment.source_attachment_id
      ? { source_attachment_id: attachment.source_attachment_id }
      : {}),
    ...(attachment.ordinal !== undefined ? { ordinal: attachment.ordinal } : {}),
    display_name: attachment.display_name,
    ...(attachment.content_type ? { content_type: attachment.content_type } : {}),
    ...(attachment.size_bytes !== undefined
      ? { size_bytes: attachment.size_bytes }
      : {}),
    inline: attachment.inline,
    ...(attachment.content_id ? { content_id: attachment.content_id } : {}),
    ...(attachment.content_hash ? { content_hash: attachment.content_hash } : {}),
    ...(attachment.content_ref ? { content_ref: attachment.content_ref } : {}),
    ...(attachment.content_ref?.startsWith("inline-base64:")
      ? { content_file_ref: `attachments/by-id/${safeSegment(attachment.attachment_key)}` }
      : {}),
    ...(attachment.source_extensions
      ? { source_extensions: attachment.source_extensions }
      : {}),
  }));
}

function filenameForAttachment(attachment: NormalizedAttachment): string {
  const name = attachment.display_name?.trim() || attachment.attachment_key;
  return safeSegment(name);
}

async function writeAttachmentFiles(
  stagingDir: string,
  attachments: NormalizedAttachment[],
): Promise<void> {
  for (const attachment of attachments) {
    const ref = attachment.content_ref;
    if (!ref?.startsWith("inline-base64:")) {
      continue;
    }

    const bytes = Buffer.from(ref.slice("inline-base64:".length), "base64");
    await writeFile(join(stagingDir, "attachments", "by-id", safeSegment(attachment.attachment_key)), bytes);
    await writeFile(join(stagingDir, "attachments", "by-name", filenameForAttachment(attachment)), bytes);
  }
}

/**
 * Calculate a simple checksum for integrity validation
 */
function calculateChecksum(data: string): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

let tempPathCounter = 0;

export interface FileMessageStoreOptions {
  rootDir: string;
  /** If true, validate checksums on read operations */
  validateChecksums?: boolean;
}

export class FileMessageStore implements MessageStore {
  private readonly messagesDir: string;
  private readonly tmpDir: string;
  private readonly validateChecksums: boolean;

  constructor(params: FileMessageStoreOptions) {
    this.messagesDir = join(params.rootDir, "messages");
    this.tmpDir = join(params.rootDir, "tmp");
    this.validateChecksums = params.validateChecksums ?? false;
  }

  private messageDir(messageId: string): string {
    return join(this.messagesDir, safeSegment(messageId));
  }

  async upsertFromPayload(payload: NormalizedPayload): Promise<void> {
    const destinationDir = this.messageDir(payload.message_id);
    const nonce = `${process.pid}.${Date.now()}.${tempPathCounter++}`;
    const stagingDir = join(
      this.tmpDir,
      `message.${safeSegment(payload.message_id)}.${nonce}`,
    );
    const priorDir = `${destinationDir}.prior.${nonce}`;
    let destinationExists = false;

    try {
      await mkdir(this.messagesDir, { recursive: true });
      await mkdir(this.tmpDir, { recursive: true });
      await mkdir(stagingDir, { recursive: true });
      await mkdir(join(stagingDir, "body"), { recursive: true });
      await mkdir(join(stagingDir, "attachments", "by-id"), {
        recursive: true,
      });
      await mkdir(join(stagingDir, "attachments", "by-name"), {
        recursive: true,
      });

      const existing = await this.readRecord(payload.message_id) as NormalizedPayload | null;
      const mergedPayload = mergePartialPayload(existing, payload);

      const textBody = bodyTextFromPayload(mergedPayload);
      const htmlBody = bodyHtmlFromPayload(mergedPayload);

      if (textBody !== undefined) {
        await writeText(join(stagingDir, "body", "body.txt"), textBody);
      }

      if (htmlBody !== undefined) {
        await writeText(join(stagingDir, "body", "body.html"), htmlBody);
      }

      const manifest = buildAttachmentManifest(mergedPayload.attachments ?? []);
      await writeJson(join(stagingDir, "attachments", "manifest.json"), manifest);
      await writeAttachmentFiles(stagingDir, mergedPayload.attachments ?? []);

      // Calculate checksum of the record for integrity validation
      const record = {
        ...mergedPayload,
        body_refs: {
          ...(textBody !== undefined ? { text: "body/body.txt" } : {}),
          ...(htmlBody !== undefined ? { html: "body/body.html" } : {}),
        },
        attachment_manifest_ref: "attachments/manifest.json",
        _checksum: "", // placeholder, filled below
      };

      const recordJson = JSON.stringify(record);
      record._checksum = calculateChecksum(recordJson);

      await writeJson(join(stagingDir, "record.json"), record);

      destinationExists = await exists(destinationDir);

      // Atomic replacement: move existing to prior, move staging to destination, remove prior
      if (destinationExists) {
        await rename(destinationDir, priorDir);
      }

      await rename(stagingDir, destinationDir);

      if (destinationExists) {
        await rm(priorDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Cleanup on error
      await this.cleanupStaging(stagingDir, destinationDir, priorDir, destinationExists);

      // Check for disk full
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOSPC") {
        throw new StorageError(
          `Disk full: unable to write message ${payload.message_id}`,
          {
            code: ErrorCode.STORAGE_DISK_FULL,
            phase: "message:upsert",
            recoverable: false,
            metadata: { messageId: payload.message_id },
            cause: nodeError,
          },
        );
      }

      throw wrapError(error, {
        phase: "message:upsert",
        messageId: payload.message_id,
        operation: "upsertFromPayload",
      });
    }
  }

  private async cleanupStaging(
    stagingDir: string,
    destinationDir: string,
    priorDir: string,
    destinationExisted: boolean,
  ): Promise<void> {
    try {
      // If destination doesn't exist but should have, try to restore from prior
      const destinationNowExists = await exists(destinationDir).catch(() => false);
      if (!destinationNowExists && destinationExisted) {
        const priorExists = await exists(priorDir).catch(() => false);
        if (priorExists) {
          await rename(priorDir, destinationDir).catch(() => undefined);
        }
      }

      // Clean up staging
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    } catch {
      // Best effort cleanup
    }
  }

  async remove(messageId: string): Promise<void> {
    const destinationDir = this.messageDir(messageId);
    try {
      await rm(destinationDir, { recursive: true, force: true });
    } catch (error) {
      throw wrapError(error, {
        phase: "message:remove",
        messageId,
        operation: "rm",
      });
    }
  }

  async readRecord(messageId: string): Promise<unknown | null> {
    const recordPath = join(this.messageDir(messageId), "record.json");

    try {
      const raw = await readFile(recordPath, "utf8");
      let parsed: unknown;

      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (parseError) {
        throw new CorruptionError(
          `Message record contains invalid JSON: ${messageId}`,
          {
            phase: "message:read",
            metadata: { messageId, recordPath },
            cause: parseError instanceof Error ? parseError : undefined,
          },
        );
      }

      // Validate checksum if enabled
      if (this.validateChecksums && parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const storedChecksum = record._checksum as string | undefined;

        if (storedChecksum) {
          // Create a copy without checksum for validation
          const { _checksum, ...recordWithoutChecksum } = record;
          const calculatedChecksum = calculateChecksum(
            JSON.stringify({ ...recordWithoutChecksum, _checksum: "" }),
          );

          if (calculatedChecksum !== storedChecksum) {
            throw new CorruptionError(
              `Message record checksum mismatch: ${messageId}`,
              {
                code: ErrorCode.CHECKSUM_MISMATCH,
                phase: "message:read",
                metadata: {
                  messageId,
                  expectedChecksum: storedChecksum,
                  actualChecksum: calculatedChecksum,
                },
              },
            );
          }
        }
      }

      return parsed;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }

      if (error instanceof CorruptionError) {
        throw error;
      }

      throw wrapError(error, {
        phase: "message:read",
        messageId,
        operation: "readFile",
      });
    }
  }

  /**
   * Check if a message exists and is complete (has record.json)
   */
  async isComplete(messageId: string): Promise<boolean> {
    const recordPath = join(this.messageDir(messageId), "record.json");
    try {
      await stat(recordPath);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code !== "ENOENT";
    }
  }

  /**
   * Get message metadata for diagnostics
   */
  async getMetadata(messageId: string): Promise<{
    exists: boolean;
    path: string;
    isComplete: boolean;
  }> {
    const dir = this.messageDir(messageId);
    const recordPath = join(dir, "record.json");

    const dirExists = await exists(dir);
    const recordExists = await exists(recordPath);

    return {
      exists: dirExists,
      path: dir,
      isComplete: recordExists,
    };
  }
}
