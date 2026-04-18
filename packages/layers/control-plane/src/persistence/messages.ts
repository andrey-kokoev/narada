import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type {
  NormalizedAttachment,
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
    ...(attachment.source_extensions
      ? { source_extensions: attachment.source_extensions }
      : {}),
  }));
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

      const textBody = bodyTextFromPayload(payload);
      const htmlBody = bodyHtmlFromPayload(payload);

      if (textBody !== undefined) {
        await writeText(join(stagingDir, "body", "body.txt"), textBody);
      }

      if (htmlBody !== undefined) {
        await writeText(join(stagingDir, "body", "body.html"), htmlBody);
      }

      const manifest = buildAttachmentManifest(payload.attachments ?? []);
      await writeJson(join(stagingDir, "attachments", "manifest.json"), manifest);

      // Calculate checksum of the record for integrity validation
      const record = {
        ...payload,
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
