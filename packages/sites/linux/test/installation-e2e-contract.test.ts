import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyLinuxInstallationLifecyclePlan,
  buildLinuxInstallationLifecyclePlan,
  checkProviderReadiness,
  envVarName,
  ensureSiteDir,
  inspectSystemdCapability,
  readLinuxInstallationState,
  resolveSiteRoot,
} from "../src/index.js";
import { DefaultLinuxSiteSupervisor } from "../src/supervisor.js";
import type { LinuxSiteConfig, LinuxSiteMode } from "../src/types.js";

describe("Linux installation E2E contract (controlled fixture)", () => {
  let fixtureRoot: string;
  const previousSiteRoot = process.env.NARADA_SITE_ROOT;
  const previousConfigHome = process.env.XDG_CONFIG_HOME;

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "narada-linux-installation-e2e-"));
    process.env.NARADA_SITE_ROOT = fixtureRoot;
    process.env.XDG_CONFIG_HOME = join(fixtureRoot, "config");
  });

  afterEach(async () => {
    if (previousSiteRoot === undefined) delete process.env.NARADA_SITE_ROOT;
    else process.env.NARADA_SITE_ROOT = previousSiteRoot;
    if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousConfigHome;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  function siteConfig(mode: LinuxSiteMode, siteId = `linux-e2e-${mode}`): LinuxSiteConfig {
    const siteRoot = join(fixtureRoot, siteId);
    return {
      site_id: siteId,
      mode,
      site_root: siteRoot,
      config_path: join(siteRoot, "config.json"),
      cycle_interval_minutes: 5,
      lock_ttl_ms: 310_000,
      ceiling_ms: 300_000,
      cli_command: ["narada", "cycle", "--site", siteId],
    };
  }

  it("materializes canonical user and system Site roots without crossing the fixture boundary", async () => {
    for (const mode of ["user", "system"] as const) {
      const root = resolveSiteRoot(`canonical-${mode}`, mode);
      expect(root.replaceAll("\\", "/")).toContain(`/canonical-${mode}`);
      await ensureSiteDir(`canonical-${mode}`, mode);
      await access(root);
      for (const directory of ["state", "messages", "views", "blobs", "tmp", "db", "logs", "traces"]) {
        await access(join(root, directory));
      }
    }
  });

  it("executes the same lifecycle receipt/state contract for linux-user and linux-system", async () => {
    for (const mode of ["user", "system"] as const) {
      const site = siteConfig(mode);
      const baseRequest = {
        operation: "upgrade" as const,
        site_id: site.site_id,
        mode,
        site_root: site.site_root,
        current_version: "0.1.0",
        target_version: "0.2.0",
        supervisor_registered: true,
        operation_id: `linux-e2e-${mode}-upgrade`,
      };
      const dryRun = buildLinuxInstallationLifecyclePlan(baseRequest);
      expect(dryRun.status).toBe("planned");
      expect(dryRun.mutation_performed).toBe(false);
      expect(dryRun.steps.map((step) => step.mutation_owner)).toEqual([
        "narada_site",
        "package_manager",
        "supervisor",
        "narada_site",
      ]);

      const applied = await applyLinuxInstallationLifecyclePlan(
        buildLinuxInstallationLifecyclePlan({ ...baseRequest, apply: true }),
      );
      expect(applied.status).toBe("applied");
      expect(applied.mutation_performed).toBe(true);
      expect(applied.data_preservation.site_data_preserved).toBe(true);
      expect(await readLinuxInstallationState(site.site_root)).toMatchObject({
        site_id: site.site_id,
        mode,
        installation_status: "installed",
        site_data_preserved: true,
      });
      expect(JSON.parse(await readFile(applied.evidence_path, "utf8"))).toMatchObject({
        status: "applied",
        operation: "upgrade",
        data_preservation: {
          site_data_preserved: true,
        },
      });
    }
  });

  it("refuses destructive, incompatible, and partial-install paths with inspectable recovery evidence", async () => {
    const site = siteConfig("user", "linux-e2e-negative");
    const removeData = buildLinuxInstallationLifecyclePlan({
      operation: "uninstall",
      site_id: site.site_id,
      mode: site.mode,
      site_root: site.site_root,
      remove_data: true,
      apply: true,
      operation_id: "linux-e2e-remove-data",
    });
    expect(removeData.status).toBe("refused");
    expect(removeData.refusal_reason).toBe("data_removal_requires_separate_guarded_operation");

    const incompatibleRollback = buildLinuxInstallationLifecyclePlan({
      operation: "rollback",
      site_id: site.site_id,
      mode: site.mode,
      site_root: site.site_root,
      current_schema_version: "1",
      rollback_to_version: "0.1.0",
      target_schema_version: "2",
      operation_id: "linux-e2e-incompatible-rollback",
    });
    expect(incompatibleRollback.status).toBe("refused");
    expect(incompatibleRollback.refusal_reason).toBe("rollback_schema_boundary_requires_migration_artifact");

    const statePath = join(site.site_root, "runtime", "installation", "linux-installation-state.json");
    await mkdir(statePath, { recursive: true });
    const partial = await applyLinuxInstallationLifecyclePlan(
      buildLinuxInstallationLifecyclePlan({
        operation: "upgrade",
        site_id: site.site_id,
        mode: site.mode,
        site_root: site.site_root,
        current_version: "0.1.0",
        target_version: "0.2.0",
        operation_id: "linux-e2e-partial-install",
        apply: true,
      }),
    );
    expect(partial.status).toBe("partial");
    expect(partial.next_action).toContain("Inspect the lifecycle receipt");
    expect(JSON.parse(await readFile(partial.evidence_path, "utf8"))).toMatchObject({ status: "partial" });
  });

  it("refuses missing systemd and insufficient system privilege while preserving the user fallback", async () => {
    const missingSystemd = await inspectSystemdCapability("user", {
      systemdAvailable: false,
      systemctlAvailable: false,
      effectiveUid: 1000,
      runtimeDirectory: fixtureRoot,
    });
    expect(missingSystemd.status).toBe("refused");
    expect(missingSystemd.reasons).toEqual(expect.arrayContaining([
      "systemd is not available on this host",
      "systemctl is not available on this host",
    ]));

    const userSite = siteConfig("user", "linux-e2e-supervisor-user");
    const fallback = new DefaultLinuxSiteSupervisor({
      capability: {
        systemdAvailable: false,
        systemctlAvailable: false,
        effectiveUid: 1000,
        runtimeDirectory: fixtureRoot,
      },
    });
    const fallbackRegistration = await fallback.register(userSite);
    expect(fallbackRegistration.status).toBe("planned");
    expect(fallbackRegistration.data_preserved).toBe(true);
    expect(fallbackRegistration.cronEntry).toBeTruthy();
    await access(fallbackRegistration.cronEntry!);

    const systemSite = siteConfig("system", "linux-e2e-supervisor-system");
    const systemRefusal = await new DefaultLinuxSiteSupervisor({
      capability: {
        systemdAvailable: true,
        systemctlAvailable: true,
        effectiveUid: 1000,
        runtimeDirectory: fixtureRoot,
      },
    }).register(systemSite);
    expect(systemRefusal.status).toBe("refused");
    expect(systemRefusal.refusal_reason).toContain("root privileges");
  });

  it("reports provider readiness without leaking secrets across ready and refusal states", async () => {
    const siteId = "linux-e2e-provider";
    const secretName = "provider-key";
    const environmentVariable = envVarName(siteId, secretName);
    const previousSecret = process.env[environmentVariable];
    delete process.env[environmentVariable];
    const helper = process.execPath;
    try {
      const common = { secretServiceCommand: helper, passCommand: helper };
      const missing = await checkProviderReadiness(siteId, "user", "fixture-provider", secretName, common);
      expect(missing.status).toBe("missing");

      const ready = await checkProviderReadiness(siteId, "user", "fixture-provider", secretName, {
        ...common,
        configValue: "fixture-secret-must-not-escape",
        endpoint: "https://provider.invalid",
        endpointProbe: async () => "available",
      });
      expect(ready.status).toBe("ready");

      const malformed = await checkProviderReadiness(siteId, "user", "fixture-provider", secretName, {
        ...common,
        configValue: "fixture-secret-must-not-escape",
        endpoint: "ftp://provider.invalid",
      });
      expect(malformed.status).toBe("malformed");

      const unavailable = await checkProviderReadiness(siteId, "user", "fixture-provider", secretName, {
        ...common,
        configValue: "fixture-secret-must-not-escape",
        endpoint: "https://provider.invalid",
        endpointProbe: async () => "unavailable",
      });
      expect(unavailable.status).toBe("unavailable");
      expect(JSON.stringify({ missing, ready, malformed, unavailable })).not.toContain("fixture-secret-must-not-escape");
    } finally {
      if (previousSecret === undefined) delete process.env[environmentVariable];
      else process.env[environmentVariable] = previousSecret;
    }
  });
});
