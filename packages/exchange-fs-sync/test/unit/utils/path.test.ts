import { describe, it, expect } from "vitest";
import {
  normalizePath,
  toPlatformPath,
  isAbsolutePath,
  resolvePath,
  ensureLongPathSupport,
  joinPath,
  dirname,
  basename,
} from "../../../src/utils/path.js";
import { isWindows } from "../../../src/utils/platform.js";

describe("path utils", () => {
  describe("normalizePath", () => {
    it("should convert backslashes to forward slashes", () => {
      expect(normalizePath("foo\\bar\\baz")).toBe("foo/bar/baz");
    });

    it("should keep forward slashes as-is", () => {
      expect(normalizePath("foo/bar/baz")).toBe("foo/bar/baz");
    });

    it("should normalize .. and . segments", () => {
      expect(normalizePath("foo/./bar/../baz")).toBe("foo/baz");
    });
  });

  describe("toPlatformPath", () => {
    it("should convert forward slashes to platform separator on Windows", () => {
      const result = toPlatformPath("foo/bar/baz");
      if (isWindows) {
        expect(result).toBe("foo\\bar\\baz");
      } else {
        expect(result).toBe("foo/bar/baz");
      }
    });
  });

  describe("isAbsolutePath", () => {
    it("should detect Unix absolute paths", () => {
      expect(isAbsolutePath("/foo/bar")).toBe(true);
      expect(isAbsolutePath("foo/bar")).toBe(false);
    });

    it("should detect Windows absolute paths", () => {
      expect(isAbsolutePath("C:\\foo\\bar")).toBe(true);
      expect(isAbsolutePath("C:/foo/bar")).toBe(true);
      expect(isAbsolutePath("\\foo\\bar")).toBe(true);
      expect(isAbsolutePath("foo\\bar")).toBe(false);
    });

    it("should detect UNC paths on Windows", () => {
      expect(isAbsolutePath("\\\\server\\share")).toBe(true);
    });
  });

  describe("ensureLongPathSupport", () => {
    it("should return path unchanged on non-Windows", () => {
      if (isWindows) return;

      const path = "/very/long/path";
      expect(ensureLongPathSupport(path)).toBe(path);
    });

    it("should return path unchanged if already has prefix", () => {
      if (!isWindows) return;

      const path = "\\\\?\\C:\\foo\\bar";
      expect(ensureLongPathSupport(path)).toBe(path);
    });

    it("should handle UNC paths on Windows", () => {
      if (!isWindows) return;

      const result = ensureLongPathSupport("\\\\server\\share");
      expect(result).toContain("UNC");
    });
  });

  describe("joinPath", () => {
    it("should join with forward slashes", () => {
      expect(joinPath("foo", "bar", "baz")).toBe("foo/bar/baz");
    });

    it("should handle single segment", () => {
      expect(joinPath("foo")).toBe("foo");
    });
  });

  describe("dirname", () => {
    it("should get directory from path", () => {
      expect(dirname("foo/bar/baz")).toBe("foo/bar");
    });

    it("should return / for root paths", () => {
      expect(dirname("/foo")).toBe("/");
    });

    it("should return . for simple names", () => {
      expect(dirname("foo")).toBe(".");
    });
  });

  describe("basename", () => {
    it("should get basename from path", () => {
      expect(basename("foo/bar/baz.txt")).toBe("baz.txt");
    });

    it("should remove extension if provided", () => {
      expect(basename("foo/bar/baz.txt", ".txt")).toBe("baz");
    });

    it("should handle simple names", () => {
      expect(basename("foo")).toBe("foo");
    });
  });
});
