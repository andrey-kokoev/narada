/**
 * Secure credential storage using OS keychain or encrypted file fallback
 */

import { mkdir, readFile, writeFile, chmod, stat } from "node:fs/promises";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { homedir } from "node:os";

const SERVICE_NAME = "narada";

export interface SecureStorage {
  getCredential(key: string): Promise<string | null>;
  setCredential(key: string, value: string): Promise<void>;
  deleteCredential(key: string): Promise<void>;
  hasCredential(key: string): Promise<boolean>;
}

/**
 * Check if keytar is available
 */
async function isKeytarAvailable(): Promise<boolean> {
  try {
    await import("keytar");
    return true;
  } catch {
    return false;
  }
}

/**
 * OS keychain implementation using keytar
 */
export class KeychainStorage implements SecureStorage {
  private account: string;
  private keytar: typeof import("keytar") | null = null;

  constructor(scopeId: string) {
    this.account = scopeId;
  }

  private async getKeytar(): Promise<typeof import("keytar")> {
    if (!this.keytar) {
      this.keytar = await import("keytar");
    }
    return this.keytar;
  }

  async getCredential(key: string): Promise<string | null> {
    const keytar = await this.getKeytar();
    const result = await keytar.getPassword(`${SERVICE_NAME}:${key}`, this.account);
    return result;
  }

  async setCredential(key: string, value: string): Promise<void> {
    const keytar = await this.getKeytar();
    await keytar.setPassword(`${SERVICE_NAME}:${key}`, this.account, value);
  }

  async deleteCredential(key: string): Promise<void> {
    const keytar = await this.getKeytar();
    await keytar.deletePassword(`${SERVICE_NAME}:${key}`, this.account);
  }

  async hasCredential(key: string): Promise<boolean> {
    const keytar = await this.getKeytar();
    const result = await keytar.findCredentials(`${SERVICE_NAME}:${key}`);
    return result.some((cred) => cred.account === this.account);
  }
}

// Sync versions for internal use
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";

/**
 * File-based secure storage with encryption fallback
 * Uses AES-256-GCM for encryption
 */
export class FileSecureStorage implements SecureStorage {
  private readonly storageDir: string;
  private readonly key: Buffer;

  constructor(scopeId: string) {
    // Store in OS-specific config directory
    this.storageDir = join(homedir(), ".narada", "credentials", scopeId);
    this.key = this.getOrCreateKey();
  }

  private getOrCreateKey(): Buffer {
    const keyPath = join(this.storageDir, ".key");

    if (existsSync(keyPath)) {
      const keyData = readFileSync(keyPath);
      return scryptSync(keyData, SERVICE_NAME, 32);
    }

    // Generate new key
    mkdirSync(this.storageDir, { recursive: true });
    const keyData = randomBytes(32);
    writeFileSync(keyPath, keyData, { mode: 0o600 });

    // Set directory permissions (Unix)
    if (process.platform !== "win32") {
      try {
        chmodSync(this.storageDir, 0o700);
      } catch {
        // Ignore permission errors
      }
    }

    return scryptSync(keyData, SERVICE_NAME, 32);
  }

  private getCredentialPath(key: string): string {
    // Sanitize key for filesystem
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.storageDir, `${safeKey}.enc`);
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();
    // Store: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted credential format");
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  async getCredential(key: string): Promise<string | null> {
    const path = this.getCredentialPath(key);

    try {
      const encrypted = await readFile(path, "utf8");
      return this.decrypt(encrypted);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async setCredential(key: string, value: string): Promise<void> {
    const path = this.getCredentialPath(key);
    const encrypted = this.encrypt(value);

    await mkdir(this.storageDir, { recursive: true });
    await writeFile(path, encrypted, { mode: 0o600 });

    // Ensure directory permissions (Unix)
    if (process.platform !== "win32") {
      try {
        await chmod(this.storageDir, 0o700);
      } catch {
        // Ignore permission errors
      }
    }
  }

  async deleteCredential(key: string): Promise<void> {
    const path = this.getCredentialPath(key);
    try {
      await rm(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  async hasCredential(key: string): Promise<boolean> {
    const path = this.getCredentialPath(key);
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

import { rm } from "node:fs/promises";

/**
 * Factory to create the best available secure storage
 */
export async function createSecureStorage(
  scopeId: string,
  preferFileStorage = false,
): Promise<SecureStorage> {
  if (!preferFileStorage && (await isKeytarAvailable())) {
    return new KeychainStorage(scopeId);
  }
  return new FileSecureStorage(scopeId);
}

/**
 * In-memory secure storage for testing
 */
export class InMemorySecureStorage implements SecureStorage {
  private store = new Map<string, string>();

  async getCredential(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setCredential(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async deleteCredential(key: string): Promise<void> {
    this.store.delete(key);
  }

  async hasCredential(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Import chmodSync
import { chmodSync } from "node:fs";
