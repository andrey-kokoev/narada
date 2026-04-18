/**
 * File permission utilities for security
 * Ensures files are created with appropriate permissions
 */

import { stat, chmod, access, constants } from "node:fs/promises";

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether the permissions are secure */
  secure: boolean;
  /** List of permission issues found */
  issues: string[];
  /** Raw file mode (Unix) */
  mode?: number;
  /** Owner info */
  uid?: number;
  /** Group info */
  gid?: number;
}

/**
 * Ensure a file has private permissions (owner only)
 * Unix: 0o600 (owner read/write)
 * Windows: no-op (ACLs are different)
 */
export async function ensurePrivateFile(path: string): Promise<void> {
  if (process.platform === "win32") {
    // Windows uses ACLs, skip for now
    return;
  }

  await chmod(path, 0o600);
}

export async function setPrivateFile(path: string): Promise<void> {
  try {
    await ensurePrivateFile(path);
  } catch (error) {
    throw new PermissionError((error as Error).message);
  }
}

/**
 * Ensure a directory has private permissions (owner only)
 * Unix: 0o700 (owner read/write/execute)
 * Windows: no-op
 */
export async function ensurePrivateDirectory(path: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  await chmod(path, 0o700);
}

export async function setGroupReadableFile(path: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  try {
    await chmod(path, PermissionMode.GROUP_READABLE_FILE);
  } catch (error) {
    throw new PermissionError((error as Error).message);
  }
}

/**
 * Check file permissions for security issues
 */
export async function checkFilePermissions(path: string): Promise<PermissionCheckResult> {
  try {
    const s = await stat(path);
    const mode = s.mode;
    const issues: string[] = [];

    // Only check on Unix systems
    if (process.platform !== "win32") {
      // Extract permission bits
      const ownerRead = mode & 0o400;
      const ownerWrite = mode & 0o200;
      const groupRead = mode & 0o040;
      const groupWrite = mode & 0o020;
      const groupExecute = mode & 0o010;
      const otherRead = mode & 0o004;
      const otherWrite = mode & 0o002;
      const otherExecute = mode & 0o001;

      if (groupRead) issues.push("Group has read access");
      if (otherRead) issues.push("Others have read access");
      if (groupWrite) issues.push("Group has write access");
      if (otherWrite) issues.push("Others have write access");
      if (groupExecute) issues.push("Group has execute access");
      if (otherExecute) issues.push("Others have execute access");

      // Check if owner has no read/write
      if (!ownerRead) issues.push("Owner lacks read access");
      if (!ownerWrite) issues.push("Owner lacks write access");
    }

    return {
      secure: issues.length === 0,
      issues,
      mode,
      uid: s.uid,
      gid: s.gid,
    };
  } catch (error) {
    return {
      secure: false,
      issues: [`Failed to check permissions: ${(error as Error).message}`],
    };
  }
}

/**
 * Check directory permissions for security issues
 */
export async function checkDirectoryPermissions(path: string): Promise<PermissionCheckResult> {
  const result = await checkFilePermissions(path);

  // Additional directory-specific checks
  if (result.mode !== undefined) {
    const ownerExecute = result.mode & 0o100;
    if (!ownerExecute) {
      result.issues.push("Owner lacks execute access (cannot list directory)");
      result.secure = false;
    }
  }

  return result;
}

/**
 * Verify that a file is readable and writable by the current user
 */
export async function verifyFileAccess(
  path: string,
  mode: "read" | "write" | "readwrite" = "readwrite",
): Promise<{ accessible: boolean; error?: string }> {
  try {
    let modeFlag = 0;

    if (mode === "read" || mode === "readwrite") {
      modeFlag |= constants.R_OK;
    }
    if (mode === "write" || mode === "readwrite") {
      modeFlag |= constants.W_OK;
    }

    await access(path, modeFlag);
    return { accessible: true };
  } catch (error) {
    return {
      accessible: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Recommended permission modes
 */
export const PermissionMode = {
  /** Private file: owner read/write only */
  PRIVATE_FILE: 0o600,
  /** Private directory: owner read/write/execute only */
  PRIVATE_DIR: 0o700,
  /** Group readable file: owner read/write, group read */
  GROUP_READABLE_FILE: 0o640,
  /** Public readable file: owner read/write, group/others read */
  PUBLIC_READABLE_FILE: 0o644,
  /** Executable file: owner read/write/execute */
  EXECUTABLE_FILE: 0o700,
} as const;

/**
 * Apply recommended permissions based on file type
 */
export async function applySecurePermissions(
  path: string,
  type: "file" | "directory" | "executable" = "file",
): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  switch (type) {
    case "file":
      await chmod(path, PermissionMode.PRIVATE_FILE);
      break;
    case "directory":
      await chmod(path, PermissionMode.PRIVATE_DIR);
      break;
    case "executable":
      await chmod(path, PermissionMode.EXECUTABLE_FILE);
      break;
  }
}

/**
 * Scan a directory and report permission issues
 */
export async function scanDirectoryPermissions(
  dirPath: string,
  options: {
    /** Recurse into subdirectories */
    recursive?: boolean;
    /** Only report issues (default: true) */
    issuesOnly?: boolean;
  } = {},
): Promise<
  Array<{
    path: string;
    type: "file" | "directory";
    result: PermissionCheckResult;
  }>
> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const results: Array<{
    path: string;
    type: "file" | "directory";
    result: PermissionCheckResult;
  }> = [];

  async function scan(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        const result = await checkDirectoryPermissions(fullPath);
        if (!options.issuesOnly || !result.secure) {
          results.push({ path: fullPath, type: "directory", result });
        }

        if (options.recursive) {
          await scan(fullPath);
        }
      } else if (entry.isFile()) {
        const result = await checkFilePermissions(fullPath);
        if (!options.issuesOnly || !result.secure) {
          results.push({ path: fullPath, type: "file", result });
        }
      }
    }
  }

  await scan(dirPath);
  return results;
}

/**
 * Fix permissions on a directory tree
 */
export async function fixDirectoryPermissions(
  dirPath: string,
  options: {
    /** Recurse into subdirectories */
    recursive?: boolean;
    /** Fix files as well as directories */
    fixFiles?: boolean;
  } = {},
): Promise<{ fixed: number; errors: Array<{ path: string; error: string }> }> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  let fixed = 0;
  const errors: Array<{ path: string; error: string }> = [];

  async function fix(currentPath: string, type: "file" | "directory"): Promise<void> {
    try {
      if (type === "directory") {
        await ensurePrivateDirectory(currentPath);
      } else {
        await ensurePrivateFile(currentPath);
      }
      fixed++;
    } catch (error) {
      errors.push({
        path: currentPath,
        error: (error as Error).message,
      });
    }
  }

  // Fix the root directory
  await fix(dirPath, "directory");

  if (options.recursive || options.fixFiles) {
    const entries = await readdir(dirPath, { withFileTypes: true, recursive: options.recursive });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.parentPath ?? "", entry.name);

      if (entry.isDirectory()) {
        await fix(fullPath, "directory");
      } else if (entry.isFile() && options.fixFiles) {
        await fix(fullPath, "file");
      }
    }
  }

  return { fixed, errors };
}

/**
 * Check if running as root/admin (should be avoided)
 */
export function isRunningAsRoot(): boolean {
  if (process.platform === "win32") {
    // Check for admin privileges on Windows
    // This is a simplified check
    return process.env.PRIVILEGES === "Admin";
  }

  // Unix: check UID
  return process.getuid?.() === 0;
}

/**
 * Security check result for startup validation
 */
export interface SecurityCheckResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Run security checks on the data directory
 */
export async function runSecurityChecks(dataDir: string): Promise<SecurityCheckResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for root
  if (isRunningAsRoot()) {
    warnings.push("Running as root/administrator is not recommended");
  }

  // Check data directory permissions
  try {
    const dirCheck = await checkDirectoryPermissions(dataDir);
    if (!dirCheck.secure) {
      errors.push(
        `Data directory has insecure permissions: ${dirCheck.issues.join(", ")}`,
      );
    }
  } catch (error) {
    errors.push(`Cannot check data directory permissions: ${(error as Error).message}`);
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
}
