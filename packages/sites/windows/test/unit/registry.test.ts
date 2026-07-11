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
import Database from "@narada2/sqlite";
import { createSiteContinuityExchangePacket } from "@narada2/site-continuity";
import {
  SiteRegistry,
  openRegistryDb,
  resolveRegistryDbPath,
  resolveRegistryDbPathByLocus,
  resolveSitesBaseDir,
} from "../../src/registry.js";
import { createWindowsSiteContinuityReadModel } from "../../src/site-observation.js";
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

  it("resolves native user-locus registry under the visible user Narada root", () => {
    delete process.env.NARADA_USER_SITE_ROOT;
    process.env.USERPROFILE = "C:\\Users\\Andrey";

    expect(resolveRegistryDbPathByLocus({
      variant: "native",
      authorityLocus: "user",
    })).toBe("C:\\Users\\Andrey\\Narada\\registry.db");
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
  let db: Database;
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

  describe("registry management", () => {
    it("previews without mutation and applies an auditable add", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-management-"));
      const siteRoot = join(tempDir, "managed-site");
      mkdirSync(siteRoot, { recursive: true });

      const request = {
        operation: "add" as const,
        siteId: "managed-site",
        actor: "test-operator",
        siteRoot,
        source: { kind: "manual", ref: "test", observedAt: "2026-07-10T12:00:00.000Z" },
      };

      const preview = registry.manageSite({ ...request, apply: false });
      expect(preview.status).toBe("planned");
      expect(preview.mutationPerformed).toBe(false);
      expect(registry.getSite("managed-site")).toBeNull();

      const applied = registry.manageSite({ ...request, apply: true });
      expect(applied.status).toBe("applied");
      expect(applied.mutationPerformed).toBe(true);
      expect(applied.auditRef).toMatch(/^registry-management-/);
      expect(applied.after?.observationStatus).toBe("present");
      expect(registry.getManagementAuditRecords("managed-site")).toHaveLength(1);

      const repeated = registry.manageSite({ ...request, apply: true });
      expect(repeated.status).toBe("unchanged");
      expect(repeated.mutationPerformed).toBe(false);
      expect(registry.getManagementAuditRecords("managed-site")).toHaveLength(1);
    });

    it("supports explicit clearing of optional edit metadata", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-management-"));
      const siteRoot = join(tempDir, "clearable-site");
      mkdirSync(siteRoot, { recursive: true });
      const source = { kind: "manual", ref: "test", observedAt: "2026-07-10T12:00:00.000Z" };

      registry.manageSite({
        operation: "add",
        siteId: "clearable-site",
        actor: "test-operator",
        siteRoot,
        source,
        aimJson: JSON.stringify({ purpose: "temporary" }),
        controlEndpoint: "https://example.invalid/control",
        aliases: [{ value: "temporary-site", source: "manual" }],
        apply: true,
      });

      const clearRequest = {
        operation: "edit" as const,
        siteId: "clearable-site",
        actor: "test-operator",
        reason: "remove obsolete optional metadata",
        clearAimJson: true,
        clearControlEndpoint: true,
        clearAliases: true,
      };
      const preview = registry.manageSite({ ...clearRequest, apply: false });
      expect(preview.status).toBe("planned");
      expect(preview.after?.aimJson).toBeNull();
      expect(preview.after?.controlEndpoint).toBeNull();
      expect(preview.after?.aliases).toEqual([]);

      const applied = registry.manageSite({ ...clearRequest, apply: true });
      expect(applied.status).toBe("applied");
      expect(applied.after?.aimJson).toBeNull();
      expect(applied.after?.controlEndpoint).toBeNull();
      expect(applied.after?.aliases).toEqual([]);

      const conflictingRequest = registry.manageSite({
        ...clearRequest,
        aimJson: "{}",
        apply: false,
      });
      expect(conflictingRequest.status).toBe("refused");
      expect(conflictingRequest.refusals).toContain("clear_aim_json_with_value");
    });

    it("rejects duplicate roots and resolves aliases for edits", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-management-"));
      const siteRoot = join(tempDir, "managed-site");
      mkdirSync(siteRoot, { recursive: true });
      const source = { kind: "manual", ref: "test", observedAt: "2026-07-10T12:00:00.000Z" };

      registry.manageSite({
        operation: "add",
        siteId: "canonical-site",
        actor: "test-operator",
        siteRoot,
        source,
        aliases: [{ value: "legacy-site", source: "manual" }],
        apply: true,
      });

      const aliasConflict = registry.manageSite({
        operation: "add",
        siteId: "alias-conflict-site",
        actor: "test-operator",
        siteRoot: join(tempDir, "alias-conflict-site"),
        source,
        aliases: [{ value: "canonical-site", source: "manual" }],
        apply: true,
      });
      expect(aliasConflict.status).toBe("refused");
      expect(aliasConflict.conflicts[0]?.code).toBe("alias_owned_by_other_site");

      registry.manageSite({
        operation: "add",
        siteId: "other-site",
        actor: "test-operator",
        siteRoot: join(tempDir, "other-site"),
        source,
        apply: true,
      });
      const editAliasConflict = registry.manageSite({
        operation: "edit",
        siteId: "canonical-site",
        actor: "test-operator",
        aliases: [{ value: "other-site", source: "manual" }],
        reason: "test alias collision",
        apply: true,
      });
      expect(editAliasConflict.status).toBe("refused");
      expect(editAliasConflict.conflicts[0]?.code).toBe("alias_owned_by_other_site");

      const conflict = registry.manageSite({
        operation: "add",
        siteId: "second-site",
        actor: "test-operator",
        siteRoot,
        source,
        apply: true,
      });
      expect(conflict.status).toBe("refused");
      expect(conflict.conflicts[0]?.code).toBe("root_owned_by_other_site");

      const edited = registry.manageSite({
        operation: "edit",
        siteId: "legacy-site",
        actor: "test-operator",
        substrate: "windows-native",
        reason: "normalize substrate metadata",
        apply: true,
      });
      expect(edited.status).toBe("applied");
      expect(edited.siteId).toBe("canonical-site");
      expect(registry.getManagedSite("legacy-site")?.substrate).toBe("windows-native");
    });

    it("enforces revision checks and reversible retirement before purge", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-management-"));
      const siteRoot = join(tempDir, "managed-site");
      mkdirSync(siteRoot, { recursive: true });
      const source = { kind: "manual", ref: "test", observedAt: "2026-07-10T12:00:00.000Z" };

      const added = registry.manageSite({
        operation: "add",
        siteId: "managed-site",
        actor: "test-operator",
        siteRoot,
        source,
        apply: true,
      });
      const revision = added.after!.revision;

      const activePurge = registry.manageSite({
        operation: "purge",
        siteId: "managed-site",
        actor: "test-operator",
        reason: "must be retired first",
        confirmSiteId: "managed-site",
        apply: false,
      });
      expect(activePurge.status).toBe("refused");
      expect(activePurge.refusals).toContain("purge_requires_retired_site");

      const stale = registry.manageSite({
        operation: "edit",
        siteId: "managed-site",
        actor: "test-operator",
        substrate: "stale-write",
        reason: "stale revision test",
        expectedRevision: revision - 1,
        apply: true,
      });
      expect(stale.status).toBe("refused");
      expect(stale.refusals[0]).toContain("revision_conflict");

      const retired = registry.manageSite({
        operation: "retire",
        siteId: "managed-site",
        actor: "test-operator",
        reason: "test retirement",
        apply: true,
      });
      expect(retired.after?.lifecycleStatus).toBe("retired");

      const purgePreview = registry.manageSite({
        operation: "purge",
        siteId: "managed-site",
        actor: "test-operator",
        reason: "preview purge confirmation",
        apply: false,
      });
      expect(purgePreview.status).toBe("planned");
      expect(purgePreview.changes).toContain("record_purged");

      const restored = registry.manageSite({
        operation: "restore",
        siteId: "managed-site",
        actor: "test-operator",
        reason: "test restore",
        apply: true,
      });
      expect(restored.after?.lifecycleStatus).toBe("active");

      const retiredAgain = registry.manageSite({
        operation: "retire",
        siteId: "managed-site",
        actor: "test-operator",
        reason: "prepare purge",
        apply: true,
      });
      expect(retiredAgain.after?.lifecycleStatus).toBe("retired");

      const purged = registry.manageSite({
        operation: "purge",
        siteId: "managed-site",
        actor: "test-operator",
        reason: "remove registry metadata",
        confirmSiteId: "managed-site",
        apply: true,
      });
      expect(purged.status).toBe("applied");
      expect(registry.getSite("managed-site")).toBeNull();
      expect(registry.getManagementAuditRecords("managed-site")).toHaveLength(6);
      expect(existsSync(siteRoot)).toBe(true);
    });

    it("does not resurrect retired records during discovery and requires explicit re-admission", () => {
      tempDir = mkdtempSync(join(tmpdir(), "registry-management-"));
      const siteRoot = join(tempDir, "managed-site");
      mkdirSync(siteRoot, { recursive: true });
      const source = { kind: "filesystem", ref: siteRoot, observedAt: "2026-07-10T12:00:00.000Z" };

      registry.manageSite({
        operation: "add",
        siteId: "managed-site",
        actor: "test-operator",
        siteRoot,
        source,
        apply: true,
      });
      registry.manageSite({
        operation: "retire",
        siteId: "managed-site",
        actor: "test-operator",
        reason: "retired for discovery test",
        apply: true,
      });

      const rediscovered = registry.manageSite({
        operation: "add",
        siteId: "managed-site",
        actor: "test-operator",
        siteRoot,
        source,
        apply: true,
      });
      expect(rediscovered.status).toBe("refused");
      expect(rediscovered.refusals).toContain("retired_record_requires_restore_or_re_admit");
      expect(registry.getManagedSite("managed-site")?.lifecycleStatus).toBe("retired");

      const readmitted = registry.manageSite({
        operation: "add",
        siteId: "managed-site",
        actor: "test-operator",
        siteRoot,
        source,
        reason: "operator confirmed re-admission",
        reAdmit: true,
        apply: true,
      });
      expect(readmitted.status).toBe("applied");
      expect(readmitted.after?.lifecycleStatus).toBe("active");
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

  describe("importContinuityPacket / listContinuityPackets", () => {
    it("stores admitted continuity exchange packets", () => {
      const continuity = createWindowsSiteContinuityReadModel({
        site_id: "site-continuity",
        generated_at: "2026-06-07T21:30:00.000Z",
      });

      const result = registry.importContinuityPacket(continuity.exchange_packet, {
        importedAt: "2026-06-07T21:31:00.000Z",
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe("imported");
      expect(result.decision.action).toBe("projection_only");

      const packets = registry.listContinuityPackets("site-continuity");
      expect(packets).toHaveLength(1);
      expect(packets[0]!.siteId).toBe("site-continuity");
      expect(packets[0]!.sourceEmbodimentKind).toBe("local_windows");
      expect(packets[0]!.targetEmbodimentKind).toBe("cloudflare_carrier");
      expect(packets[0]!.admissionAction).toBe("projection_only");
    });

    it("refuses packets carrying executable mutation requests", () => {
      const continuity = createWindowsSiteContinuityReadModel({ site_id: "site-continuity-refused" });
      const packet = createSiteContinuityExchangePacket({
        binding: continuity.binding,
        source_embodiment_kind: "cloudflare_carrier",
        target_embodiment_kind: "local_windows",
        executable_mutation_requests: [{ mutation_class: "local_repository_filesystem_mutation" }],
      });

      const result = registry.importContinuityPacket(packet);

      expect(result.ok).toBe(false);
      expect(result.status).toBe("refused");
      expect(result.decision.reason).toBe("site_continuity_exchange_packet_executable_mutation_refused");
      expect(registry.listContinuityPackets("site-continuity-refused")).toEqual([]);
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
