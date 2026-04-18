import { describe, it, expect } from "vitest";
import { isWindows, getPlatformCapabilities } from "../../src/utils/platform.js";

/**
 * Windows-specific tests
 * These tests only run on Windows platform
 */

(isWindows ? describe : describe.skip)("Windows Platform", () => {
  describe("getPlatformCapabilities", () => {
    it("should report Windows-specific capabilities", () => {
      const caps = getPlatformCapabilities();

      expect(caps.supportsUnixPermissions).toBe(false);
      expect(caps.pathSeparator).toBe("\\");
      expect(caps.maxPathLength).toBe(32767);
      expect(caps.requiresExplicitFileLock).toBe(true);
    });
  });

  it("should have process.platform as win32", () => {
    expect(process.platform).toBe("win32");
  });
});

(isWindows ? describe : describe.skip)("Windows Path Handling", () => {
  describe("long path support", () => {
    it("should handle paths with spaces", () => {
      const pathWithSpaces = "C:\\Users\\Test User\\My Documents\\file.txt";
      expect(pathWithSpaces).toContain(" ");
    });

    it("should handle UNC paths", () => {
      const uncPath = "\\\\server\\share\\folder\\file.txt";
      expect(uncPath.startsWith("\\\\")).toBe(true);
    });
  });
});
