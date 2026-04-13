/**
 * Cross-platform path utilities
 *
 * All internal paths use forward slashes (/) for consistency.
 * Platform-specific paths are only created at fs operation boundaries.
 */

import { normalize, posix, isAbsolute, resolve } from "node:path";
import { isWindows } from "./platform.js";

/**
 * Normalize a path for internal storage (always forward slashes)
 */
export function normalizePath(input: string): string {
  return normalize(input.replaceAll("\\", posix.sep)).replaceAll("\\", posix.sep);
}

/**
 * Convert an internal path to a platform-specific path for fs operations
 */
export function toPlatformPath(internalPath: string): string {
  if (isWindows) {
    return internalPath.replaceAll(posix.sep, "\\");
  }
  return internalPath;
}

/**
 * Check if a path is absolute (works on all platforms)
 */
export function isAbsolutePath(p: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  if (/^\\\\[^\\]+\\[^\\]+/.test(p)) return true;
  if (/^[\\/][^\\/]/.test(p)) return true;
  return isAbsolute(p);
}

/**
 * Resolve a path to an absolute path
 */
export function resolvePath(...paths: string[]): string {
  return resolve(...paths);
}

/**
 * Ensure long path support on Windows by adding the \\?\ prefix if needed.
 * Windows MAX_PATH is 260 chars; prefix enables ~32k paths.
 *
 * Note: This must be used with absolute paths only.
 */
export function ensureLongPathSupport(inputPath: string): string {
  if (!isWindows) {
    return inputPath;
  }

  // Already has long path prefix
  if (inputPath.startsWith("\\\\?\\")) {
    return inputPath;
  }

  // UNC paths need special handling (\\?\UNC\server\share)
  if (inputPath.startsWith("\\\\")) {
    const uncPath = inputPath.slice(2); // Remove leading \\
    return `\\\\?\\UNC\\${uncPath}`;
  }

  // Regular path - resolve to absolute and add prefix
  const absolute = resolve(inputPath);
  return `\\\\?\\${absolute}`;
}

/**
 * Join path segments using internal forward-slash separator
 */
export function joinPath(...segments: string[]): string {
  return segments.join(posix.sep);
}

/**
 * Get the directory name from an internal path
 */
export function dirname(internalPath: string): string {
  const lastSep = internalPath.lastIndexOf(posix.sep);
  if (lastSep === -1) {
    return ".";
  }
  return internalPath.slice(0, lastSep) || posix.sep;
}

/**
 * Get the basename from an internal path
 */
export function basename(internalPath: string, ext?: string): string {
  const lastSep = internalPath.lastIndexOf(posix.sep);
  const name = lastSep === -1 ? internalPath : internalPath.slice(lastSep + 1);
  if (ext && name.endsWith(ext)) {
    return name.slice(0, -ext.length);
  }
  return name;
}
