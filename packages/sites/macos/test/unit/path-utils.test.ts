import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveSiteRoot,
  sitePath,
  sitePathFromRoot,
  ensureSiteDir,
  ensureSiteDirFromRoot,
  siteConfigPath,
  siteConfigPathFromRoot,
  siteCoordinatorPath,
  siteTracesPathFromRoot,
  SITE_SUBDIRECTORIES,
} from "../../src/path-utils.js";

describe("path-utils", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-macos-path-test-"));
    delete process.env.NARADA_SITE_ROOT;
  });

  afterEach(() => {
    delete process.env.NARADA_SITE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("resolveSiteRoot", () => {
    it("returns path under ~/Library/Application Support/Narada/", () => {
      const root = resolveSiteRoot("my-site");
      expect(root).toContain("Library");
      expect(root).toContain("Application Support");
      expect(root).toContain("Narada");
      expect(root).toContain("my-site");
    });

    it("respects NARADA_SITE_ROOT env override", () => {
      process.env.NARADA_SITE_ROOT = tempDir;
      const root = resolveSiteRoot("my-site");
      expect(root).toBe(join(tempDir, "my-site"));
    });

    it("respects explicit envOverride argument over env", () => {
      process.env.NARADA_SITE_ROOT = "/ignored";
      const root = resolveSiteRoot("my-site", tempDir);
      expect(root).toBe(join(tempDir, "my-site"));
    });

    it("handles site ids with spaces", () => {
      const root = resolveSiteRoot("my site");
      expect(root).toContain(join("Narada", "my site"));
    });
  });

  describe("sitePath", () => {
    it("joins segments after the site root", () => {
      process.env.NARADA_SITE_ROOT = tempDir;
      const path = sitePath("my-site", "db", "coordinator.db");
      expect(path).toBe(join(tempDir, "my-site", "db", "coordinator.db"));
    });
  });

  describe("sitePathFromRoot", () => {
    it("joins segments directly to the provided root", () => {
      const root = join(tempDir, "custom-root");
      const path = sitePathFromRoot(root, "traces", "cycle.json");
      expect(path).toBe(join(root, "traces", "cycle.json"));
    });
  });

  describe("ensureSiteDir", () => {
    it("creates all standard subdirectories (siteId-based)", async () => {
      process.env.NARADA_SITE_ROOT = tempDir;
      await ensureSiteDir("test-site");

      for (const subdir of SITE_SUBDIRECTORIES) {
        const subdirPath = join(tempDir, "test-site", subdir);
        expect(() => statSync(subdirPath)).not.toThrow();
      }
    });
  });

  describe("ensureSiteDirFromRoot", () => {
    it("creates all standard subdirectories (siteRoot-based)", async () => {
      const root = join(tempDir, "explicit-root");
      await ensureSiteDirFromRoot(root);

      for (const subdir of SITE_SUBDIRECTORIES) {
        const subdirPath = join(root, subdir);
        expect(() => statSync(subdirPath)).not.toThrow();
      }
    });

    it("handles paths with spaces in Application Support", async () => {
      const root = join(tempDir, "Application Support", "Narada", "space-site");
      await ensureSiteDirFromRoot(root);

      expect(() => statSync(join(root, "state"))).not.toThrow();
      expect(() => statSync(join(root, "logs"))).not.toThrow();
    });
  });

  describe("siteConfigPathFromRoot", () => {
    it("returns config.json under the provided root", () => {
      const root = join(tempDir, "site");
      expect(siteConfigPathFromRoot(root)).toBe(join(root, "config.json"));
    });
  });

  describe("siteCoordinatorPath", () => {
    it("returns coordinator.db under the provided root", () => {
      const root = join(tempDir, "site");
      expect(siteCoordinatorPath(root)).toBe(join(root, "db", "coordinator.db"));
    });
  });

  describe("siteTracesPathFromRoot", () => {
    it("returns traces directory under the provided root", () => {
      const root = join(tempDir, "site");
      expect(siteTracesPathFromRoot(root)).toBe(join(root, "traces"));
    });
  });
});
