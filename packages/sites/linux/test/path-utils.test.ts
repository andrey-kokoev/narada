import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectMode,
  resolveSiteRoot,
  sitePath,
  ensureSiteDir,
  siteConfigPath,
  siteDbPath,
  siteLogsPath,
  siteTracesPath,
  siteRuntimePath,
  SITE_SUBDIRECTORIES,
} from "../src/path-utils.js";

describe("path-utils", () => {
  const testRoot = join(tmpdir(), "narada-linux-test-" + Date.now());

  beforeEach(async () => {
    process.env.NARADA_SITE_ROOT = testRoot;
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.NARADA_SITE_ROOT;
    try {
      await rm(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("detectMode", () => {
    it("returns user mode by default in test environment", () => {
      delete process.env.NARADA_SITE_MODE;
      const mode = detectMode();
      expect(mode).toBe("user");
    });

    it("respects NARADA_SITE_MODE override", () => {
      process.env.NARADA_SITE_MODE = "system";
      expect(detectMode()).toBe("system");
      process.env.NARADA_SITE_MODE = "user";
      expect(detectMode()).toBe("user");
    });
  });

  describe("resolveSiteRoot", () => {
    it("resolves system-mode path", () => {
      delete process.env.NARADA_SITE_ROOT;
      const root = resolveSiteRoot("test-site", "system");
      expect(root).toBe("/var/lib/narada/test-site");
    });

    it("resolves user-mode path", () => {
      delete process.env.NARADA_SITE_ROOT;
      const root = resolveSiteRoot("test-site", "user");
      expect(root).toContain(".local/share/narada/test-site");
    });

    it("respects NARADA_SITE_ROOT override", () => {
      const root = resolveSiteRoot("test-site", "system");
      expect(root).toBe(join(testRoot, "test-site"));
    });
  });

  describe("sitePath", () => {
    it("builds paths inside site root", () => {
      const path = sitePath("test-site", "user", "db", "coordinator.db");
      expect(path).toContain("test-site/db/coordinator.db");
    });
  });

  describe("ensureSiteDir", () => {
    it("creates site directory and subdirectories", async () => {
      await ensureSiteDir("test-site", "user");
      const root = resolveSiteRoot("test-site", "user");

      for (const subdir of SITE_SUBDIRECTORIES) {
        const subdirPath = join(root, subdir);
        const stat = await import("node:fs/promises").then((m) => m.stat(subdirPath));
        expect(stat.isDirectory()).toBe(true);
      }
    });
  });

  describe("convenience paths", () => {
    it("siteConfigPath returns config.json path", () => {
      const path = siteConfigPath("test-site", "user");
      expect(path).toContain("config.json");
    });

    it("siteDbPath returns coordinator.db path", () => {
      const path = siteDbPath("test-site", "user");
      expect(path).toContain("coordinator.db");
    });

    it("siteLogsPath returns logs directory", () => {
      const path = siteLogsPath("test-site", "user");
      expect(path).toContain("logs");
    });

    it("siteTracesPath returns traces directory", () => {
      const path = siteTracesPath("test-site", "user");
      expect(path).toContain("traces");
    });

    it("siteRuntimePath returns system runtime path", () => {
      const path = siteRuntimePath("test-site", "system");
      expect(path).toBe("/run/narada/test-site");
    });

    it("siteRuntimePath returns user runtime path", () => {
      const path = siteRuntimePath("test-site", "user");
      expect(path).toContain("/run/user/");
      expect(path).toContain("narada/test-site");
    });
  });
});
