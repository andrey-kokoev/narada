import { describe, it, expect } from "vitest";
import {
  normalizeLineEndings,
  toPlatformLineEndings,
  normalizeForStorage,
  normalizeForPlatform,
} from "../../../src/utils/text.js";
import { isWindows } from "../../../src/utils/platform.js";

describe("text utils", () => {
  describe("normalizeLineEndings", () => {
    it("should convert CRLF to LF", () => {
      const input = "line1\r\nline2\r\nline3";
      expect(normalizeLineEndings(input)).toBe("line1\nline2\nline3");
    });

    it("should keep LF as-is", () => {
      const input = "line1\nline2\nline3";
      expect(normalizeLineEndings(input)).toBe(input);
    });

    it("should handle mixed line endings", () => {
      const input = "line1\r\nline2\nline3\r\n";
      expect(normalizeLineEndings(input)).toBe("line1\nline2\nline3\n");
    });

    it("should handle empty string", () => {
      expect(normalizeLineEndings("")).toBe("");
    });
  });

  describe("toPlatformLineEndings", () => {
    it("should convert LF to CRLF on Windows", () => {
      const input = "line1\nline2\nline3";
      const result = toPlatformLineEndings(input);

      if (isWindows) {
        expect(result).toBe("line1\r\nline2\r\nline3");
      } else {
        expect(result).toBe(input);
      }
    });

    it("should keep LF on non-Windows", () => {
      if (isWindows) return;

      const input = "line1\nline2";
      expect(toPlatformLineEndings(input)).toBe(input);
    });
  });

  describe("normalizeForStorage", () => {
    it("should always normalize to LF", () => {
      const input = "line1\r\nline2\r\n";
      expect(normalizeForStorage(input)).toBe("line1\nline2\n");
    });
  });

  describe("normalizeForPlatform", () => {
    it("should convert to platform line endings", () => {
      const input = "line1\nline2";
      const result = normalizeForPlatform(input);

      if (isWindows) {
        expect(result).toBe("line1\r\nline2");
      } else {
        expect(result).toBe(input);
      }
    });
  });
});
