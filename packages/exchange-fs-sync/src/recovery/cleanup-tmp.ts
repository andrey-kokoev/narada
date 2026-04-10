import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export interface CleanupTmpOptions {
  rootDir: string;
  maxAgeMs?: number;
}

export async function cleanupTmp(
  opts: CleanupTmpOptions,
): Promise<void> {
  const tmpDir = join(opts.rootDir, "tmp");
  const maxAgeMs = opts.maxAgeMs ?? 24 * 60 * 60_000;

  let entries: string[];

  try {
    entries = await readdir(tmpDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return;
    }
    throw error;
  }

  const now = Date.now();

  await Promise.all(
    entries.map(async (name) => {
      const path = join(tmpDir, name);

      try {
        const s = await stat(path);
        const ageMs = now - s.mtimeMs;

        if (ageMs > maxAgeMs) {
          await rm(path, { recursive: true, force: true });
        }
      } catch {
        // best-effort cleanup
      }
    }),
  );
}
