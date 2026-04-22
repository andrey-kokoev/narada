import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateSystemdService,
  generateSystemdTimer,
  generateCronEntry,
  generateShellScript,
  writeSystemdUnits,
  removeSystemdUnits,
  unitDir,
  DefaultLinuxSiteSupervisor,
  isSystemdAvailable,
  validateSystemdService,
} from "../src/supervisor.js";
import { resolveSiteRoot } from "../src/path-utils.js";

describe("supervisor", () => {
  const testRoot = join(tmpdir(), "narada-linux-supervisor-test-" + Date.now());
  const siteId = "test-site";
  const mode = "user" as const;

  const baseConfig = {
    site_id: siteId,
    mode,
    site_root: resolveSiteRoot(siteId, mode),
    config_path: join(resolveSiteRoot(siteId, mode), "config.json"),
    cycle_interval_minutes: 5,
    lock_ttl_ms: 310_000,
    ceiling_ms: 300_000,
  };

  beforeEach(async () => {
    process.env.NARADA_SITE_ROOT = testRoot;
    process.env.XDG_CONFIG_HOME = join(testRoot, ".config");
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.NARADA_SITE_ROOT;
    delete process.env.XDG_CONFIG_HOME;
    try {
      await rm(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("generateSystemdService", () => {
    it("generates a valid service unit for system mode", () => {
      const config = { ...baseConfig, mode: "system" as const };
      const service = generateSystemdService(config);
      expect(service).toContain("[Unit]");
      expect(service).toContain("[Service]");
      expect(service).toContain("Type=oneshot");
      expect(service).toContain(`Description=Narada Site Cycle Runner -- ${siteId}`);
      expect(service).toContain("After=network-online.target");
      expect(service).toContain("NoNewPrivileges=yes");
      expect(service).toContain("PrivateTmp=yes");
      expect(service).toContain("RuntimeDirectory=narada/test-site");
      expect(service).toContain("MemoryMax=512M");
      expect(service).toContain("TimeoutStopSec=30");
    });

    it("generates a valid service unit for user mode", () => {
      const service = generateSystemdService(baseConfig);
      expect(service).toContain("Type=oneshot");
      expect(service).toContain("NoNewPrivileges=yes");
      expect(service).toContain("TimeoutStopSec=30");
    });

    it("includes v1 hardening when requested", () => {
      const service = generateSystemdService(baseConfig, { hardeningLevel: "v1" });
      expect(service).toContain("ProtectSystem=strict");
      expect(service).toContain("ProtectHome=yes");
      expect(service).toContain("ReadWritePaths=");
    });

    it("omits v1 hardening by default", () => {
      const service = generateSystemdService(baseConfig);
      expect(service).not.toContain("ProtectSystem=strict");
      expect(service).not.toContain("ProtectHome=yes");
    });
  });

  describe("validateSystemdService", () => {
    it("passes for a well-formed generated unit", () => {
      const service = generateSystemdService(baseConfig);
      const result = validateSystemdService(service);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails when missing required sections", () => {
      const result = validateSystemdService("ExecStart=/bin/true");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing [Unit] section");
      expect(result.errors).toContain("Missing [Service] section");
    });

    it("fails when missing network ordering", () => {
      const bad = `[Unit]
[Service]
Type=oneshot
TimeoutStartSec=10
TimeoutStopSec=30
`;
      const result = validateSystemdService(bad);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Missing After=network-online.target or After=network.target"
      );
    });

    it("fails when missing timeout directives", () => {
      const bad = `[Unit]
After=network-online.target
[Service]
Type=oneshot
`;
      const result = validateSystemdService(bad);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing TimeoutStartSec=");
      expect(result.errors).toContain("Missing TimeoutStopSec=");
    });
  });

  describe("generateSystemdTimer", () => {
    it("generates a valid timer unit", () => {
      const timer = generateSystemdTimer(baseConfig);
      expect(timer).toContain("[Unit]");
      expect(timer).toContain("[Timer]");
      expect(timer).toContain("[Install]");
      expect(timer).toContain("OnBootSec=1min");
      expect(timer).toContain("OnUnitActiveSec=5min");
      expect(timer).toContain("Persistent=true");
      expect(timer).toContain("WantedBy=timers.target");
    });

    it("uses correct interval", () => {
      const timer = generateSystemdTimer({ ...baseConfig, cycle_interval_minutes: 10 });
      expect(timer).toContain("OnUnitActiveSec=10min");
    });
  });

  describe("generateCronEntry", () => {
    it("generates a cron entry for sub-hourly intervals (config overload)", () => {
      const entry = generateCronEntry(baseConfig);
      expect(entry).toContain("*/5 * * * *");
      expect(entry).toContain("narada cycle --site test-site");
    });

    it("generates a cron entry for hourly intervals (config overload)", () => {
      const entry = generateCronEntry({ ...baseConfig, cycle_interval_minutes: 120 });
      expect(entry).toContain("0 */2 * * *");
    });

    it("generates a cron entry from discrete parameters", () => {
      const entry = generateCronEntry(siteId, mode, 10);
      expect(entry).toContain("*/10 * * * *");
      expect(entry).toContain("narada cycle --site test-site");
    });
  });

  describe("generateShellScript", () => {
    it("generates a runnable shell script", () => {
      const script = generateShellScript(baseConfig);
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("set -euo pipefail");
      expect(script).toContain(`SITE_ID="${siteId}"`);
      expect(script).toContain("narada cycle --site");
    });
  });

  describe("writeSystemdUnits / removeSystemdUnits", () => {
    it("writes and removes unit files", async () => {
      const { servicePath, timerPath } = await writeSystemdUnits(baseConfig);

      expect(servicePath).toContain("narada-site-test-site.service");
      expect(timerPath).toContain("narada-site-test-site.timer");

      const { readFile } = await import("node:fs/promises");
      const serviceContent = await readFile(servicePath, "utf8");
      expect(serviceContent).toContain("[Unit]");

      await removeSystemdUnits(siteId, mode);

      // Files should be removed
      const exists = async (p: string) => {
        try {
          await readFile(p);
          return true;
        } catch {
          return false;
        }
      };
      expect(await exists(servicePath)).toBe(false);
      expect(await exists(timerPath)).toBe(false);
    });
  });

  describe("unitDir", () => {
    it("returns system unit directory", () => {
      expect(unitDir("system")).toBe("/etc/systemd/system");
    });

    it("returns user unit directory", () => {
      const dir = unitDir("user");
      expect(dir).toContain("systemd/user");
    });
  });

  describe("DefaultLinuxSiteSupervisor", () => {
    it("lists registered sites from unit files", async () => {
      const supervisor = new DefaultLinuxSiteSupervisor();

      // Write unit files for two sites
      await writeSystemdUnits(baseConfig);
      await writeSystemdUnits({ ...baseConfig, site_id: "other-site" });

      const registered = await supervisor.listRegistered(mode);
      expect(registered).toContain("test-site");
      expect(registered).toContain("other-site");
    });

    it("unregisters a site", async () => {
      const supervisor = new DefaultLinuxSiteSupervisor();
      await writeSystemdUnits(baseConfig);

      let registered = await supervisor.listRegistered(mode);
      expect(registered).toContain("test-site");

      await supervisor.unregister(siteId, mode);

      registered = await supervisor.listRegistered(mode);
      expect(registered).not.toContain("test-site");
    });
  });

  describe("isSystemdAvailable", () => {
    it("returns a boolean without throwing", async () => {
      const available = await isSystemdAvailable();
      expect(typeof available).toBe("boolean");
    });
  });
});
