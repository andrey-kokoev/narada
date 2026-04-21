import { existsSync, readFileSync } from "node:fs";

/**
 * Load environment variables from a `.env` file at the given path.
 * Only sets `process.env[key]` if it is not already defined.
 * Skips comments and blank lines. Silent no-op if the file does not exist.
 */
export function loadEnvFile(path: string): void {
  try {
    if (!existsSync(path)) return;
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // silent no-op if .env cannot be read
  }
}
