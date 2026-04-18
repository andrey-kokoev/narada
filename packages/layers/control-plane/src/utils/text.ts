/**
 * Cross-platform text utilities
 *
 * Handles line ending normalization for consistent storage across platforms.
 */

import { isWindows } from "./platform.js";

/**
 * Normalize line endings to LF (\n) for internal storage.
 * Converts CRLF (\r\n) to LF.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Convert internal LF line endings to platform-specific line endings.
 * On Windows: converts LF to CRLF
 * On Unix: keeps LF
 */
export function toPlatformLineEndings(text: string): string {
  if (isWindows) {
    return text.replace(/\n/g, "\r\n");
  }
  return text;
}

/**
 * Normalize text for storage: always use LF line endings
 */
export function normalizeForStorage(text: string): string {
  return normalizeLineEndings(text);
}

/**
 * Normalize text for display/processing on current platform
 */
export function normalizeForPlatform(text: string): string {
  return toPlatformLineEndings(text);
}
