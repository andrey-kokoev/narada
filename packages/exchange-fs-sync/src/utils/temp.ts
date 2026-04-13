/**
 * Secure temporary file utilities
 * Creates temp files with restricted permissions and secure cleanup
 */

import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile, readFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically secure random filename
 */
export function secureRandomFilename(length = 16): string {
  return randomBytes(length).toString("hex");
}

/**
 * Options for secure temp directory creation
 */
export interface SecureTempOptions {
  /** Custom prefix for temp directory name */
  prefix?: string;
  /** Custom base directory (defaults to os.tmpdir()) */
  baseDir?: string;
  /** Directory permissions - default 0o700 (owner only) */
  mode?: number;
}

/**
 * Create a secure temporary directory with restricted permissions
 * @returns Path to the created directory
 */
export async function createSecureTempDir(
  options: SecureTempOptions = {},
): Promise<string> {
  const prefix = options.prefix ?? "exchange-sync-";
  const baseDir = options.baseDir ?? tmpdir();
  const mode = options.mode ?? 0o700;

  const tempPath = await mkdtemp(join(baseDir, prefix));

  // Set restrictive permissions (Unix only)
  if (process.platform !== "win32") {
    await chmod(tempPath, mode);
  }

  return tempPath;
}

/**
 * Execute a function with a secure temporary directory that is cleaned up afterwards
 */
export async function withSecureTemp<T>(
  fn: (dir: string) => Promise<T>,
  options?: SecureTempOptions,
): Promise<T> {
  const dir = await createSecureTempDir(options);

  try {
    return await fn(dir);
  } finally {
    // Secure cleanup - delete the directory and all contents
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Write data to a secure temporary file
 * File is created with 0o600 permissions (owner read/write only)
 */
export async function writeSecureTempFile(
  dir: string,
  filename: string,
  data: string | Buffer,
): Promise<string> {
  const filepath = join(dir, filename);
  await writeFile(filepath, data, { mode: 0o600 });
  return filepath;
}

/**
 * Read and delete a secure temp file (one-time read)
 * Useful for reading sensitive data that should not persist
 */
export async function readAndDeleteSecureTempFile(
  filepath: string,
): Promise<string> {
  try {
    const content = await readFile(filepath, "utf8");
    return content;
  } finally {
    // Always attempt to delete, even if read failed
    await rm(filepath, { force: true });
  }
}

/**
 * Create a secure temp file with automatic cleanup on process exit
 * Note: This is best-effort and not guaranteed
 */
export async function createAutoCleanupTempFile(
  data: string | Buffer,
  options?: SecureTempOptions,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await createSecureTempDir(options);
  const filename = secureRandomFilename();
  const filepath = join(dir, filename);

  await writeFile(filepath, data, { mode: 0o600 });

  // Register cleanup handlers (best effort)
  const cleanup = async (): Promise<void> => {
    await rm(dir, { recursive: true, force: true });
  };

  // Cleanup on normal exit
  process.on("exit", () => {
    try {
      // Synchronous cleanup attempt
      const { rmSync } = require("node:fs");
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on exit
    }
  });

  // Cleanup on uncaught exceptions and signals
  const signals = ["SIGINT", "SIGTERM", "SIGUSR2"];
  for (const signal of signals) {
    process.once(signal as NodeJS.Signals, () => {
      cleanup().finally(() => process.exit(0));
    });
  }

  process.once("uncaughtException", () => {
    cleanup().finally(() => process.exit(1));
  });

  return { path: filepath, cleanup };
}

/**
 * Secure file writer that ensures:
 * - Temp file is created with restricted permissions
 * - Atomic move to final destination
 * - Proper cleanup on failure
 */
export async function writeFileSecurely(
  finalPath: string,
  data: string | Buffer,
  options: {
    /** Temp directory (defaults to same dir as final file) */
    tempDir?: string;
    /** File mode (defaults to 0o600) */
    mode?: number;
  } = {},
): Promise<void> {
  const dir = options.tempDir ?? join(finalPath, "..");
  const mode = options.mode ?? 0o600;
  const tempFilename = `.tmp.${secureRandomFilename()}`;
  const tempPath = join(dir, tempFilename);

  try {
    // Write to temp file with restricted permissions
    await writeFile(tempPath, data, { mode });

    // Atomic rename to final destination
    await rename(tempPath, finalPath);
  } catch (error) {
    // Cleanup temp file on error
    await rm(tempPath, { force: true });
    throw error;
  }
}

import { rename } from "node:fs/promises";

/**
 * Options for secure temp file stream
 */
export interface TempFileStreamOptions {
  /** Auto-cleanup when stream ends */
  autoCleanup?: boolean;
  /** Custom directory */
  dir?: string;
  /** File extension */
  extension?: string;
}

/**
 * Result of creating a secure temp file stream
 */
export interface TempFileStreamResult {
  path: string;
  write: (chunk: string | Buffer) => Promise<void>;
  end: () => Promise<void>;
  cleanup: () => Promise<void>;
}

/**
 * Create a secure temp file for streaming writes
 */
export async function createSecureTempFileStream(
  options: TempFileStreamOptions = {},
): Promise<TempFileStreamResult> {
  const dir = options.dir ?? (await createSecureTempDir());
  const ext = options.extension ?? "";
  const filename = `${secureRandomFilename()}${ext}`;
  const filepath = join(dir, filename);

  // Create empty file with restricted permissions
  await writeFile(filepath, "", { mode: 0o600 });

  let handle: import("node:fs/promises").FileHandle | null = null;

  const getHandle = async () => {
    if (!handle) {
      const { open } = await import("node:fs/promises");
      handle = await open(filepath, "a", 0o600);
    }
    return handle;
  };

  return {
    path: filepath,
    write: async (chunk: string | Buffer) => {
      const h = await getHandle();
      if (typeof chunk === "string") {
        await h.write(chunk);
      } else {
        await h.write(chunk, 0, chunk.length);
      }
    },
    end: async () => {
      if (handle) {
        await handle.close();
        handle = null;
      }
      if (options.autoCleanup) {
        await rm(dir, { recursive: true, force: true });
      }
    },
    cleanup: async () => {
      if (handle) {
        await handle.close();
        handle = null;
      }
      await rm(dir, { recursive: true, force: true });
    },
  };
}
