/**
 * Secure configuration resolution
 * Supports { "$secure": "key" } references to fetch from secure storage
 */

import type { SecureStorage } from "../auth/secure-storage.js";

export interface SecureRef {
  $secure: string;
}

/**
 * Check if a value is a secure reference
 */
export function isSecureRef(value: unknown): value is SecureRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "$secure" in value &&
    typeof (value as SecureRef).$secure === "string"
  );
}

/**
 * Recursively resolve secure references in a config object
 */
export async function resolveSecrets<T>(
  value: T,
  storage: SecureStorage,
): Promise<T> {
  if (isSecureRef(value)) {
    const resolved = await storage.getCredential(value.$secure);
    if (resolved === null) {
      throw new Error(
        `Secure credential not found: "${value.$secure}". ` +
          `Use "narada credentials set --key ${value.$secure}" to store it.`,
      );
    }
    return resolved as unknown as T;
  }

  if (Array.isArray(value)) {
    const resolved = await Promise.all(
      value.map((item) => resolveSecrets(item, storage)),
    );
    return resolved as unknown as T;
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = await resolveSecrets(val, storage);
    }
    return result as unknown as T;
  }

  // Primitive value - return as-is
  return value;
}

/**
 * Extract all secure key references from a config object
 * Useful for validating that all required credentials exist
 */
export function extractSecureRefs(value: unknown): string[] {
  const refs: string[] = [];

  function recurse(val: unknown): void {
    if (isSecureRef(val)) {
      refs.push(val.$secure);
      return;
    }

    if (Array.isArray(val)) {
      for (const item of val) {
        recurse(item);
      }
      return;
    }

    if (typeof val === "object" && val !== null) {
      for (const item of Object.values(val)) {
        recurse(item);
      }
    }
  }

  recurse(value);
  return [...new Set(refs)]; // Remove duplicates
}

/**
 * Validate that all secure references in a config can be resolved
 */
export async function validateSecureRefs(
  value: unknown,
  storage: SecureStorage,
): Promise<{ valid: boolean; missing: string[] }> {
  const refs = extractSecureRefs(value);
  const missing: string[] = [];

  for (const ref of refs) {
    const exists = await storage.hasCredential(ref);
    if (!exists) {
      missing.push(ref);
    }
  }

  return { valid: missing.length === 0, missing };
}
