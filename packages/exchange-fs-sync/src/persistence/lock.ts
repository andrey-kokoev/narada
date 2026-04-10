import { mkdir, open, rm, stat } from "node:fs/promises";
import { join } from "node:path";

function nowIso(): string {
  return new Date().toISOString();
}

export interface FileLockOptions {
  rootDir: string;
  lockName?: string;
  staleAfterMs?: number;
  retryDelayMs?: number;
  acquireTimeoutMs?: number;
}

export class FileLock {
  private readonly lockDir: string;
  private readonly metaPath: string;
  private readonly staleAfterMs: number;
  private readonly retryDelayMs: number;
  private readonly acquireTimeoutMs: number;

  constructor(opts: FileLockOptions) {
    const name = opts.lockName ?? "sync.lock";
    this.lockDir = join(opts.rootDir, "state", name);
    this.metaPath = join(this.lockDir, "meta.json");
    this.staleAfterMs = opts.staleAfterMs ?? 5 * 60_000;
    this.retryDelayMs = opts.retryDelayMs ?? 250;
    this.acquireTimeoutMs = opts.acquireTimeoutMs ?? 30_000;
  }

  private async writeMeta(): Promise<void> {
    const fd = await open(this.metaPath, "w");
    try {
      await fd.writeFile(
        `${JSON.stringify(
          {
            pid: process.pid,
            acquired_at: nowIso(),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    } finally {
      await fd.close();
    }
  }

  private async isStale(): Promise<boolean> {
    try {
      const s = await stat(this.lockDir);
      const ageMs = Date.now() - s.mtimeMs;
      return ageMs > this.staleAfterMs;
    } catch {
      return false;
    }
  }

  async acquire(): Promise<() => Promise<void>> {
    const startedAt = Date.now();

    while (true) {
      try {
        await mkdir(this.lockDir, { recursive: false });
        await this.writeMeta();

        let released = false;

        return async () => {
          if (released) {
            return;
          }
          released = true;
          await rm(this.lockDir, { recursive: true, force: true });
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if (code !== "EEXIST") {
          throw error;
        }

        if (await this.isStale()) {
          await rm(this.lockDir, { recursive: true, force: true }).catch(
            () => undefined,
          );
          continue;
        }

        if (Date.now() - startedAt > this.acquireTimeoutMs) {
          throw new Error("Failed to acquire lock within timeout");
        }

        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelayMs),
        );
      }
    }
  }
}
