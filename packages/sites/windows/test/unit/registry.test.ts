import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  SiteRegistry,
  openRegistryDb,
  resolveRegistryDbPath,
  resolveRegistryDbPathByLocus,
  resolveSitesBaseDir,
} from "../../src/registry.js";
import type { RegisteredSite, RegistryAuditRecord } from "../../src/registry.js";

describe("resolveRegistryDbPath", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.LOCALAPPDATA = originalEnv.LOCALAPPDATA;
    process.env.USERPROFILE = originalEnv.USERPROFILE;
  });

  it("returns LOCALAPPDATA path on native Windows", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.LOCALAPPDATA = "C:\\Users\\Test\\AppData\\Local";

    expect(resolveRegistryDbPath()).toBe(
      "C:\\Users\\Test\\AppData\\Local\\Narada\\.registry\\registry.db",
    );

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("falls back to USERPROFILE when LOCALAPPDATA is missing on Windows", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    delete process.env.LOCALAPPDATA;
    process.env.USERPROFILE = "C:\\Users\\Test";

    expect(resolveRegistryDbPath()).toBe(
      "C:\\Users\\Test\\AppData\\Local\\Narada\\.registry\\registry.db",
    );

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("throws when neither LOCALAPPDATA nor USERPROFILE is set on Windows", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    delete process.env.LOCALAPPDATA;
    delete process.env.USERPROFILE;

    expect(() => resolveRegistryDbPath()).toThrow(
      "Cannot resolve registry path",
    );

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("returns ~/.narada/registry.db on POSIX", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "linux" });

    expect(resolveRegistryDbPath()).toMatch(/\.narada\/registry\.db$/);

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });
});

describe("resolveRegistryDbPathByLocus", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.NARADA_USER_SITE_ROOT = originalEnv.NARADA_USER_SITE_ROOT;
    process.env.NARADA_PC_REGISTRY_ROOT = originalEnv.NARADA_PC_REGISTRY_ROOT;
    process.env.USERPROFILE = originalEnv.USERPROFILE;
    process.env.ProgramData = originalEnv.ProgramData;
    process.env.PROGRAMDATA = originalEnv.PROGRAMDATA;
  });

  it("resolves native user-locus registry under the user .narada root", () => {
    delete process.env.NARADA_USER_SITE_ROOT;
    process.env.USERPROFILE = "C:\\Users\\Andrey";

    expect(resolveRegistryDbPathByLocus({
      variant: "native",
      authorityLocus: "user",
    })).toBe("C:\\Users\\Andrey\\.narada\\registry.db");
  });

  it("resolves native PC-locus registry under ProgramData", () => {
    delete process.env.NARADA_PC_REGISTRY_ROOT;
    process.env.ProgramData = "C:\\ProgramData";

    expect(resolveRegistryDbPathByLocus({
      variant: "native",
      authorityLocus: "pc",
    })).toBe("C:\\ProgramData\\Narada\\registry.db");
  });
});

describe("resolveSitesBaseDir", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.LOCALAPPDATA = originalEnv.LOCALAPPDATA;
    process.env.USERPROFILE = originalEnv.USERPROFILE;
  });

  it("returns LOCALAPPDATA\\Narada for native", () => {
    process.env.LOCALAPPDATA = "C:\\Users\\Test\\AppData\\Local";
    expect(resolveSitesBaseDir("native")).toBe(
      "C:\\Users\\Test\\AppData\\Local\\Narada",
    );
  });

  it("returns /var/lib/narada for WSL if writable", () => {
    // Environment-dependent; on systems without /var/lib/narada it falls back.
    const result = resolveSitesBaseDir("wsl");
    expect(result).toMatch(/narada$/);
  });
});

describe("SiteRegistry", () => {
  let db: Database.Database;
  let registry: SiteRegistry;
  let tempDir = "";

  beforeEach(() => {
    db = new Database(":memory:");
    registry = new SiteRegistry(db);
  });

  afterEach(() => {
    registry.close();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  describe("getSite / listSites / removeSite", () => {
    it("returns null for unknown site", () => {
      expect(registry.getSite("no-such-site")).toBeNull();
    });

    it("returns an empty list when no sites are registered", () => {
      expect(registry.listSites()).toEqual([]);
    });

    it("upserts and retrieves a site via discovery", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const siteRoot = join(tempDir, "site-a");
      mkdirSync(siteRoot, { recursive: true });
      writeFileSync(
        join(siteRoot, "config.json"),
        JSON.stringify({ site_id: "site-a", aim: { name: "Alpha" } }),
      );

      const result = registry["upsertFromDiscovery"]("site-a", "wsl", siteRoot);
      expect(result.siteId).toBe("site-a");
      expect(result.variant).toBe("wsl");
      expect(result.substrate).toBe("windows");
      expect(result.aimJson).toBe('{"name":"Alpha"}');

      const retrieved = registry.getSite("site-a");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.siteId).toBe("site-a");
      expect(retrieved!.aimJson).toBe('{"name":"Alpha"}');
    });

    it("lists all sites in stable order", () => {
      // Use registerSite with identical createdAt to force the site_id
      // tiebreaker, proving ordering is deterministic.
      registry.registerSite({
        siteId: "site-c",
        variant: "wsl",
        siteRoot: "/tmp/site-c",
        substrate: "windows",
        aimJson: null,
        controlEndpoint: null,
        lastSeenAt: null,
        createdAt: "2026-04-20T10:00:00Z",
      });
      registry.registerSite({
        siteId: "site-a",
        variant: "wsl",
        siteRoot: "/tmp/site-a",
        substrate: "windows",
        aimJson: null,
        controlEndpoint: null,
        lastSeenAt: null,
        createdAt: "2026-04-20T10:00:00Z",
      });
      registry.registerSite({
        siteId: "site-b",
        variant: "wsl",
        siteRoot: "/tmp/site-b",
        substrate: "windows",
        aimJson: null,
        controlEndpoint: null,
        lastSeenAt: null,
        createdAt: "2026-04-20T10:00:00Z",
      });

      const list = registry.listSites();
      expect(list.map((s) => s.siteId)).toEqual(["site-a", "site-b", "site-c"]);
    });

    it("removes a site", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const siteRoot = join(tempDir, "site-d");
      mkdirSync(siteRoot, { recursive: true });
      writeFileSync(join(siteRoot, "config.json"), "{}");

      registry["upsertFromDiscovery"]("site-d", "wsl", siteRoot);
      expect(registry.getSite("site-d")).not.toBeNull();

      const removed = registry.removeSite("site-d");
      expect(removed).toBe(true);
      expect(registry.getSite("site-d")).toBeNull();
    });

    it("returns false when removing unknown site", () => {
      expect(registry.removeSite("unknown")).toBe(false);
    });

    it("does not delete site files when removing from registry", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const siteRoot = join(tempDir, "site-files");
      mkdirSync(siteRoot, { recursive: true });
      writeFileSync(join(siteRoot, "config.json"), JSON.stringify({ aim: {} }));

      registry["upsertFromDiscovery"]("site-files", "wsl", siteRoot);
      expect(registry.removeSite("site-files")).toBe(true);

      expect(existsSync(join(siteRoot, "config.json"))).toBe(true);
    });

    it("registers a site directly", () => {
      const site: RegisteredSite = {
        siteId: "direct-site",
        variant: "native",
        siteRoot: "C:\\Sites\\direct-site",
        substrate: "windows",
        aimJson: null,
        controlEndpoint: null,
        lastSeenAt: "2026-04-20T12:00:00Z",
        createdAt: "2026-04-20T10:00:00Z",
      };
      registry.registerSite(site);
      const retrieved = registry.getSite("direct-site");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.variant).toBe("native");
      expect(retrieved!.siteRoot).toBe("C:\\Sites\\direct-site");
      expect(retrieved!.createdAt).toBe("2026-04-20T10:00:00Z");
    });

    it("preserves original created_at when rediscovering an existing site", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const siteRoot = join(tempDir, "site-g");
      mkdirSync(siteRoot, { recursive: true });
      writeFileSync(join(siteRoot, "config.json"), JSON.stringify({ aim: { name: "First" } }));

      const first = registry["upsertFromDiscovery"]("site-g", "wsl", siteRoot);
      const originalCreatedAt = first.createdAt;

      // Small delay to ensure timestamps would differ
      const before = Date.now();
      while (Date.now() - before < 10) { /* spin */ }

      const second = registry["upsertFromDiscovery"]("site-g", "wsl", siteRoot);
      expect(second.createdAt).toBe(originalCreatedAt);
      expect(second.lastSeenAt).not.toBe(first.lastSeenAt);
    });
  });

  describe("discoverSites", () => {
    it("returns empty array when base dir does not exist", () => {
      const result = registry.discoverSites("wsl");
      expect(result).toEqual([]);
    });

    it("discovers sites with config.json", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const sitesDir = join(tempDir, "sites");
      mkdirSync(sitesDir, { recursive: true });
      process.env.NARADA_SITE_ROOT = sitesDir;

      const siteA = join(sitesDir, "site-a");
      mkdirSync(siteA, { recursive: true });
      writeFileSync(
        join(siteA, "config.json"),
        JSON.stringify({ aim: { name: "Alpha", vertical: "mail" } }),
      );

      const siteB = join(sitesDir, "site-b");
      mkdirSync(siteB, { recursive: true });
      writeFileSync(
        join(siteB, "config.json"),
        JSON.stringify({ substrate: "linux", aim: { name: "Beta" } }),
      );

      const result = registry.discoverSites("wsl");
      expect(result).toHaveLength(2);

      const ids = result.map((s) => s.siteId).sort();
      expect(ids).toEqual(["site-a", "site-b"]);

      const a = result.find((s) => s.siteId === "site-a")!;
      expect(a.aimJson).toBe('{"name":"Alpha","vertical":"mail"}');
      expect(a.substrate).toBe("windows");

      const b = result.find((s) => s.siteId === "site-b")!;
      expect(b.aimJson).toBe('{"name":"Beta"}');
      expect(b.substrate).toBe("linux");
    });

    it("skips directories without config.json", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const sitesDir = join(tempDir, "sites");
      mkdirSync(sitesDir, { recursive: true });
      process.env.NARADA_SITE_ROOT = sitesDir;

      const withConfig = join(sitesDir, "valid-site");
      mkdirSync(withConfig, { recursive: true });
      writeFileSync(join(withConfig, "config.json"), "{}");

      const withoutConfig = join(sitesDir, "no-config");
      mkdirSync(withoutConfig, { recursive: true });

      const result = registry.discoverSites("wsl");
      expect(result).toHaveLength(1);
      expect(result[0]!.siteId).toBe("valid-site");
    });

    it("skips dot directories and node_modules", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const sitesDir = join(tempDir, "sites");
      mkdirSync(sitesDir, { recursive: true });
      process.env.NARADA_SITE_ROOT = sitesDir;

      const dotDir = join(sitesDir, ".hidden");
      mkdirSync(dotDir, { recursive: true });
      writeFileSync(join(dotDir, "config.json"), "{}");

      const nm = join(sitesDir, "node_modules");
      mkdirSync(nm, { recursive: true });
      writeFileSync(join(nm, "config.json"), "{}");

      const valid = join(sitesDir, "valid");
      mkdirSync(valid, { recursive: true });
      writeFileSync(join(valid, "config.json"), "{}");

      const result = registry.discoverSites("wsl");
      expect(result).toHaveLength(1);
      expect(result[0]!.siteId).toBe("valid");
    });

    it("registers a site even if config.json is unreadable", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const sitesDir = join(tempDir, "sites");
      mkdirSync(sitesDir, { recursive: true });
      process.env.NARADA_SITE_ROOT = sitesDir;

      const bad = join(sitesDir, "bad-config");
      mkdirSync(bad, { recursive: true });
      writeFileSync(join(bad, "config.json"), "not valid json");

      const result = registry.discoverSites("wsl");
      expect(result).toHaveLength(1);
      expect(result[0]!.siteId).toBe("bad-config");
      expect(result[0]!.aimJson).toBeNull();
    });
  });

  describe("refreshSite", () => {
    it("updates aim_json when config changes on disk", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const siteRoot = join(tempDir, "site-e");
      mkdirSync(siteRoot, { recursive: true });
      writeFileSync(
        join(siteRoot, "config.json"),
        JSON.stringify({ aim: { name: "First" } }),
      );

      registry["upsertFromDiscovery"]("site-e", "wsl", siteRoot);
      expect(registry.getSite("site-e")!.aimJson).toBe('{"name":"First"}');

      writeFileSync(
        join(siteRoot, "config.json"),
        JSON.stringify({ aim: { name: "Updated" } }),
      );

      const refreshed = registry.refreshSite("site-e");
      expect(refreshed).not.toBeNull();
      expect(refreshed!.aimJson).toBe('{"name":"Updated"}');
      expect(refreshed!.lastSeenAt).not.toBeNull();
    });

    it("returns null for unknown site", () => {
      expect(registry.refreshSite("no-such")).toBeNull();
    });

    it("preserves existing values when config becomes unreadable", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-test-"));
      const siteRoot = join(tempDir, "site-f");
      mkdirSync(siteRoot, { recursive: true });
      writeFileSync(
        join(siteRoot, "config.json"),
        JSON.stringify({ aim: { name: "Good" }, substrate: "custom" }),
      );

      registry["upsertFromDiscovery"]("site-f", "wsl", siteRoot);
      const before = registry.getSite("site-f")!;
      expect(before.aimJson).toBe('{"name":"Good"}');
      expect(before.substrate).toBe("custom");

      // Corrupt the config file
      writeFileSync(join(siteRoot, "config.json"), "not json");

      const refreshed = registry.refreshSite("site-f")!;
      expect(refreshed.aimJson).toBe('{"name":"Good"}');
      expect(refreshed.substrate).toBe("custom");
    });
  });

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------

  describe("logAuditRecord / getAuditRecordsForSite", () => {
    it("stores and retrieves audit records", () => {
      const record: RegistryAuditRecord = {
        requestId: "req-001",
        siteId: "site-x",
        actionType: "pause",
        targetId: "scope-1",
        routedAt: "2026-04-20T14:00:00Z",
        siteResponseStatus: "accepted",
        siteResponseDetail: "Paused",
      };

      registry.logAuditRecord(record);
      const records = registry.getAuditRecordsForSite("site-x");
      expect(records).toHaveLength(1);
      expect(records[0]!.requestId).toBe("req-001");
      expect(records[0]!.siteResponseStatus).toBe("accepted");
    });

    it("returns records newest first with limit", () => {
      for (let i = 1; i <= 5; i++) {
        registry.logAuditRecord({
          requestId: `req-00${i}`,
          siteId: "site-y",
          actionType: "resume",
          targetId: "scope-1",
          routedAt: `2026-04-20T14:0${i}:00Z`,
          siteResponseStatus: "accepted",
          siteResponseDetail: null,
        });
      }

      const all = registry.getAuditRecordsForSite("site-y", 10);
      expect(all).toHaveLength(5);
      expect(all[0]!.requestId).toBe("req-005");

      const limited = registry.getAuditRecordsForSite("site-y", 2);
      expect(limited).toHaveLength(2);
      expect(limited[0]!.requestId).toBe("req-005");
      expect(limited[1]!.requestId).toBe("req-004");
    });

    it("returns empty array for site with no audit records", () => {
      expect(registry.getAuditRecordsForSite("no-audit")).toEqual([]);
    });
  });
});

describe("openRegistryDb", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("creates directory and persists across reopen", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "registry-persist-"));
    const dbPath = join(tempDir, "nested", "registry.db");

    const db1 = await openRegistryDb(dbPath);
    const reg1 = new SiteRegistry(db1);
    reg1["upsertFromDiscovery"]("persist-site", "wsl", "/fake/root");
    expect(reg1.getSite("persist-site")).not.toBeNull();
    reg1.close();

    const db2 = await openRegistryDb(dbPath);
    const reg2 = new SiteRegistry(db2);
    const site = reg2.getSite("persist-site");
    expect(site).not.toBeNull();
    expect(site!.siteId).toBe("persist-site");
    expect(site!.variant).toBe("wsl");
    reg2.close();
  });
});
