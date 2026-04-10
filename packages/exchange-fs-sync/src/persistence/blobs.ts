import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NormalizedPayload } from "../types/normalized.js";
import type { BlobInstaller } from "../projector/apply-event.js";

function sha256HexBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface FileBlobStoreOptions {
  rootDir: string;
}

export class FileBlobStore implements BlobInstaller {
  private readonly blobsDir: string;
  private readonly tmpDir: string;

  constructor(opts: FileBlobStoreOptions) {
    this.blobsDir = join(opts.rootDir, "blobs", "sha256");
    this.tmpDir = join(opts.rootDir, "tmp");
  }

  private blobPath(hash: string): string {
    return join(this.blobsDir, hash.slice(0, 2), hash.slice(2, 4), hash);
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return false;
      throw error;
    }
  }

  async installBytes(bytes: Uint8Array): Promise<string> {
    const hash = sha256HexBytes(bytes);
    const destination = this.blobPath(hash);

    if (await this.exists(destination)) {
      return `blob:sha256:${hash}`;
    }

    const parentDir = join(this.blobsDir, hash.slice(0, 2), hash.slice(2, 4));
    const tmpPath = join(
      this.tmpDir,
      `blob.${hash}.${process.pid}.${Date.now()}.tmp`,
    );

    await mkdir(parentDir, { recursive: true });
    await mkdir(this.tmpDir, { recursive: true });

    try {
      await writeFile(tmpPath, bytes);
      await rename(tmpPath, destination);
    } catch (error) {
      if (!(await this.exists(destination).catch(() => false))) {
        await rm(tmpPath, { force: true }).catch(() => undefined);
        throw error;
      }
      await rm(tmpPath, { force: true }).catch(() => undefined);
    }

    return `blob:sha256:${hash}`;
  }

  async installFromPayload(payload: NormalizedPayload): Promise<void> {
    for (const attachment of payload.attachments) {
      const ref = attachment.content_ref;
      if (!ref || !ref.startsWith("inline-base64:")) {
        continue;
      }

      const encoded = ref.slice("inline-base64:".length);
      const bytes = Buffer.from(encoded, "base64");
      await this.installBytes(bytes);
    }
  }
}
