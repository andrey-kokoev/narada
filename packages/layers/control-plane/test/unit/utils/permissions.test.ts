import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  setPrivateFile,
  setGroupReadableFile,
  checkFilePermissions,
  PermissionError,
} from "../../../src/utils/permissions.js";
import { isWindows } from "../../../src/utils/platform.js";

describe("permissions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "perm-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("setPrivateFile", () => {
    it("should set file permissions on Unix", async () => {
      if (isWindows) return;

      const filePath = join(tempDir, "private.txt");
      await writeFile(filePath, "secret data");

      await setPrivateFile(filePath);

      // On Unix, file should now have 0600 permissions
      const { stat } = await import("node:fs/promises");
      const s = await stat(filePath);
      // eslint-disable-next-line no-bitwise
      const mode = s.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it("should not throw on Windows", async () => {
      if (!isWindows) return;

      const filePath = join(tempDir, "private.txt");
      await writeFile(filePath, "secret data");

      // On Windows, this may succeed or fail depending on icacls availability
      // Either way, it shouldn't throw an unexpected error
      try {
        await setPrivateFile(filePath);
      } catch (e) {
        // If it fails, it should be a PermissionError
        expect(e).toBeInstanceOf(PermissionError);
      }
    });
  });

  describe("setGroupReadableFile", () => {
    it("should set 0640 permissions on Unix", async () => {
      if (isWindows) return;

      const filePath = join(tempDir, "group.txt");
      await writeFile(filePath, "group data");

      await setGroupReadableFile(filePath);

      const { stat } = await import("node:fs/promises");
      const s = await stat(filePath);
      // eslint-disable-next-line no-bitwise
      const mode = s.mode & 0o777;
      expect(mode).toBe(0o640);
    });

    it("should not throw on Windows", async () => {
      if (!isWindows) return;

      const filePath = join(tempDir, "group.txt");
      await writeFile(filePath, "group data");

      // Should complete without error (no-op on Windows)
      await expect(setGroupReadableFile(filePath)).resolves.toBeUndefined();
    });
  });

  describe("checkFilePermissions", () => {
    it("should return secure status", async () => {
      const filePath = join(tempDir, "test.txt");
      await writeFile(filePath, "test data");
      if (!isWindows) {
        await setPrivateFile(filePath);
      }

      const result = await checkFilePermissions(filePath);

      expect(typeof result.secure).toBe("boolean");
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });

  describe("PermissionError", () => {
    it("should have correct name", () => {
      const error = new PermissionError("test message");
      expect(error.name).toBe("PermissionError");
      expect(error.message).toBe("test message");
    });
  });
});
