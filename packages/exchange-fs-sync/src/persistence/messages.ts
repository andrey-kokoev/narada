import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  NormalizedAttachment,
  NormalizedPayload,
} from "../types/normalized.js";
import type { MessageStore } from "../projector/apply-event.js";

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

function bodyTextFromPayload(payload: NormalizedPayload): string | undefined {
  return payload.body.text;
}

function bodyHtmlFromPayload(payload: NormalizedPayload): string | undefined {
  return payload.body.html;
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

export class FileMessageStore implements MessageStore {
  private readonly messagesDir: string;
  private readonly tmpDir: string;

  constructor(params: { rootDir: string }) {
    this.messagesDir = join(params.rootDir, "messages");
    this.tmpDir = join(params.rootDir, "tmp");
  }

  private messageDir(messageId: string): string {
    return join(this.messagesDir, safeSegment(messageId));
  }

  async upsertFromPayload(payload: NormalizedPayload): Promise<void> {
    const destinationDir = this.messageDir(payload.message_id);
    const stagingDir = join(
      this.tmpDir,
      `message.${safeSegment(payload.message_id)}.${process.pid}.${Date.now()}`,
    );
    const priorDir = `${destinationDir}.prior.${process.pid}.${Date.now()}`;

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

    const manifest = buildAttachmentManifest(payload.attachments);
    await writeJson(join(stagingDir, "attachments", "manifest.json"), manifest);

    const record = {
      ...payload,
      body_refs: {
        ...(textBody !== undefined ? { text: "body/body.txt" } : {}),
        ...(htmlBody !== undefined ? { html: "body/body.html" } : {}),
      },
      attachment_manifest_ref: "attachments/manifest.json",
    };

    await writeJson(join(stagingDir, "record.json"), record);

    const destinationExists = await exists(destinationDir);

    try {
      if (destinationExists) {
        await rename(destinationDir, priorDir);
      }

      await rename(stagingDir, destinationDir);

      if (destinationExists) {
        await rm(priorDir, { recursive: true, force: true });
      }
    } catch (error) {
      if (await exists(destinationDir).catch(() => false)) {
        // destination already replaced; keep it
      } else if (
        destinationExists &&
        (await exists(priorDir).catch(() => false))
      ) {
        await rename(priorDir, destinationDir).catch(() => undefined);
      }

      await rm(stagingDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw error;
    }
  }

  async remove(messageId: string): Promise<void> {
    const destinationDir = this.messageDir(messageId);
    await rm(destinationDir, { recursive: true, force: true });
  }

  async readRecord(messageId: string): Promise<unknown | null> {
    const recordPath = join(this.messageDir(messageId), "record.json");

    try {
      const raw = await readFile(recordPath, "utf8");
      return JSON.parse(raw) as unknown;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
}
