/**
 * Platform detection and capabilities
 *
 * Provides cross-platform utilities for detecting the current platform
 * and its capabilities.
 */

export const isWindows = process.platform === "win32";
export const isMacOS = process.platform === "darwin";
export const isLinux = process.platform === "linux";

export interface PlatformCapabilities {
  /** Whether the platform supports Unix-style permissions (chmod) */
  supportsUnixPermissions: boolean;
  /** Whether symbolic links are supported (with or without elevation) */
  supportsSymbolicLinks: boolean;
  /** Maximum path length with long path support */
  maxPathLength: number;
  /** Native path separator */
  pathSeparator: string;
  /** Whether file locking requires special handling */
  requiresExplicitFileLock: boolean;
}

/**
 * Get the capabilities of the current platform
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  if (isWindows) {
    return {
      supportsUnixPermissions: false,
      supportsSymbolicLinks: true, // with elevated perms or developer mode
      maxPathLength: 32767, // with \\?\ prefix
      pathSeparator: "\\",
      requiresExplicitFileLock: true,
    };
  }

  // Unix-like (Linux, macOS, etc.)
  return {
    supportsUnixPermissions: true,
    supportsSymbolicLinks: true,
    maxPathLength: isMacOS ? 1024 : 4096,
    pathSeparator: "/",
    requiresExplicitFileLock: false,
  };
}

/**
 * Assert that a condition is met for the current platform.
 * Throws if the condition is not met.
 */
export function assertPlatform(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Platform assertion failed: ${message}`);
  }
}
