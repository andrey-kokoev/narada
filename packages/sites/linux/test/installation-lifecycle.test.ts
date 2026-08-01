import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyLinuxInstallationLifecyclePlan,
  buildLinuxInstallationLifecyclePlan,
  linuxInstallationEvidencePath,
  linuxInstallationStatePath,
} from "../src/installation-lifecycle.js";

describe("Linux installation lifecycle", () => {
  it("creates an inspectable upgrade plan without mutating the Site", () => {
    const plan = buildLinuxInstallationLifecyclePlan({
      operation: "upgrade",
      site_id: "personal",
      mode: "user",
      site_root: "/tmp/narada/personal",
      current_version: "0.1.0",
      target_version: "0.2.0",
      supervisor_registered: true,
      operation_id: "upgrade-1",
    });

    expect(plan.status).toBe("planned");
    expect(plan.mutation_performed).toBe(false);
    expect(plan.data_preservation.site_data_preserved).toBe(true);
    expect(plan.package_action).toContain("@narada-core/cli@0.2.0");
    expect(plan.evidence_path).toBe(linuxInstallationEvidencePath("/tmp/narada/personal", "upgrade-1"));
    expect(plan.steps.map((step) => step.id)).toEqual([
      "preflight",
      "package-boundary",
      "supervisor-boundary",
      "evidence",
    ]);
  });

  it("refuses a rollback across a schema boundary without a migration artifact", () => {
    const plan = buildLinuxInstallationLifecyclePlan({
      operation: "rollback",
      site_id: "personal",
      mode: "user",
      site_root: "/tmp/narada/personal",
      current_version: "0.2.0",
      rollback_to_version: "0.1.0",
      current_schema_version: "2",
      target_schema_version: "1",
    });

    expect(plan.status).toBe("refused");
    expect(plan.refusal_reason).toBe("rollback_schema_boundary_requires_migration_artifact");
    expect(plan.mutation_performed).toBe(false);
  });

  it("keeps uninstall data intact and refuses bundled data removal", () => {
    const plan = buildLinuxInstallationLifecyclePlan({
      operation: "uninstall",
      site_id: "personal",
      mode: "user",
      site_root: "/tmp/narada/personal",
      supervisor_registered: true,
    });
    expect(plan.status).toBe("planned");
    expect(plan.data_preservation.default_uninstall_behavior).toBe("preserve_site_data");
    expect(plan.supervisor_action).toContain("unregister");

    const removal = buildLinuxInstallationLifecyclePlan({
      operation: "uninstall",
      site_id: "personal",
      mode: "user",
      site_root: "/tmp/narada/personal",
      remove_data: true,
      confirm_data_removal: "REMOVE_SITE_DATA",
    });
    expect(removal.status).toBe("refused");
    expect(removal.refusal_reason).toBe("data_removal_requires_separate_guarded_operation");
  });

  it("writes an applied receipt and state while preserving arbitrary Site data", async () => {
    const root = await mkdtemp(join(tmpdir(), "narada-linux-lifecycle-"));
    try {
      const plan = buildLinuxInstallationLifecyclePlan({
        operation: "migrate",
        site_id: "personal",
        mode: "user",
        site_root: root,
        current_schema_version: "1",
        target_schema_version: "2",
        migration_artifact_ref: "task://migration/2",
        apply: true,
        operation_id: "migrate-1",
      });
      const result = await applyLinuxInstallationLifecyclePlan(plan);
      expect(result.status).toBe("applied");
      expect(result.mutation_performed).toBe(true);
      expect(await stat(result.evidence_path)).toBeTruthy();
      expect(await stat(result.state_path)).toBeTruthy();
      expect(JSON.parse(await readFile(result.state_path, "utf8"))).toMatchObject({
        site_id: "personal",
        installation_status: "migrated",
        schema_version: "2",
        site_data_preserved: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
