import { describe, it, expect } from "vitest";
import {
  isWindows,
  isMacOS,
  isLinux,
  getPlatformCapabilities,
  assertPlatform,
} from "../../../src/utils/platform.js";

describe("platform", () => {
  describe("constants", () => {
    it("should have exactly one platform set to true", () => {
      const platforms = [isWindows, isMacOS, isLinux];
      const trueCount = platforms.filter(Boolean).length;
      expect(trueCount).toBe(1);
    });
  });

  describe("getPlatformCapabilities", () => {
    it("should return correct capabilities for current platform", () => {
      const caps = getPlatformCapabilities();

      expect(typeof caps.supportsUnixPermissions).toBe("boolean");
      expect(typeof caps.supportsSymbolicLinks).toBe("boolean");
      expect(typeof caps.maxPathLength).toBe("number");
      expect(typeof caps.pathSeparator).toBe("string");
      expect(typeof caps.requiresExplicitFileLock).toBe("boolean");

      // Verify max path length is reasonable
      expect(caps.maxPathLength).toBeGreaterThan(1000);

      // Verify path separator
      if (isWindows) {
        expect(caps.pathSeparator).toBe("\\");
        expect(caps.supportsUnixPermissions).toBe(false);
      } else {
        expect(caps.pathSeparator).toBe("/");
        expect(caps.supportsUnixPermissions).toBe(true);
      }
    });
  });

  describe("assertPlatform", () => {
    it("should not throw when condition is true", () => {
      expect(() => assertPlatform(true, "test")).not.toThrow();
    });

    it("should throw when condition is false", () => {
      expect(() => assertPlatform(false, "test error")).toThrow(
        "test error",
      );
    });

    it("should throw PlatformError with correct message", () => {
      try {
        assertPlatform(false, "specific error message");
        expect.fail("should have thrown");
      } catch (e) {
        expect((e as Error).message).toContain("specific error message");
      }
    });
  });
});
