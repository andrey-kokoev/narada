import { describe, expect, afterEach, it } from "vitest";

vi.unmock("node:fs");
vi.unmock("node:fs/promises");

import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  sitesRegistryAddCommand,
  sitesRegistryDiscoverCommand,
  sitesRegistryEditCommand,
  sitesRegistryListCommand,
  sitesRegistryStateCommand,
} from "../../src/commands/site-registry-management.js";
import { silentCommandContext } from "../../src/lib/command-wrapper.js";

const originalUserSiteRoot = process.env.NARADA_USER_SITE_ROOT;
const originalSiteRoot = process.env.NARADA_SITE_ROOT;

function options<T extends Record<string, unknown>>(value: T): T & { format: "json" } {
  return { ...value, format: "json" } as T & { format: "json" };
}

function createTempRoot(): string {
  const root = join("D:\\code\\narada\\packages\\layers\\cli\\.tmp", `site-registry-management-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

describe("site registry management commands", () => {
  let tempRoot = "";

  afterEach(() => {
    if (originalUserSiteRoot === undefined) delete process.env.NARADA_USER_SITE_ROOT;
    else process.env.NARADA_USER_SITE_ROOT = originalUserSiteRoot;
    if (originalSiteRoot === undefined) delete process.env.NARADA_SITE_ROOT;
    else process.env.NARADA_SITE_ROOT = originalSiteRoot;
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = "";
    }
  });

  it("keeps preview non-mutating and applies add/edit with structured output", async () => {
    tempRoot = createTempRoot();
    process.env.NARADA_USER_SITE_ROOT = join(tempRoot, "user-site");
    mkdirSync(process.env.NARADA_USER_SITE_ROOT, { recursive: true });
    const siteRoot = join(tempRoot, "existing-site");
    mkdirSync(siteRoot, { recursive: true });
    writeFileSync(join(siteRoot, "config.json"), "{}\n", "utf8");

    const context = silentCommandContext();
    const preview = await sitesRegistryAddCommand(options({
      siteId: "existing-site",
      root: siteRoot,
      alias: ["legacy-existing-site"],
      source: "manual",
      apply: false,
      dryRun: true,
    }), context);
    expect(preview.exitCode).toBe(0);
    expect((preview.result as { status: string }).status).toBe("planned");

    const applied = await sitesRegistryAddCommand(options({
      siteId: "existing-site",
      root: siteRoot,
      alias: ["legacy-existing-site"],
      source: "manual",
      apply: true,
      dryRun: false,
    }), context);
    expect(applied.exitCode).toBe(0);
    expect((applied.result as { mutation_performed: boolean }).mutation_performed).toBe(true);

    const edited = await sitesRegistryEditCommand(options({
      reference: "legacy-existing-site",
      substrate: "windows-native",
      reason: "normalize substrate",
      apply: true,
    }), context);
    expect(edited.exitCode).toBe(0);
    expect((edited.result as { site_id: string }).site_id).toBe("existing-site");

    const listed = await sitesRegistryListCommand({ format: "json" }, context);
    const sites = (listed.result as { sites: Array<{ site_id: string; substrate: string }> }).sites;
    expect(sites).toEqual([expect.objectContaining({ site_id: "existing-site", substrate: "windows-native" })]);
  });

  it("retires, restores, and purges only registry metadata", async () => {
    tempRoot = createTempRoot();
    process.env.NARADA_USER_SITE_ROOT = join(tempRoot, "user-site");
    mkdirSync(process.env.NARADA_USER_SITE_ROOT, { recursive: true });
    const siteRoot = join(tempRoot, "retirable-site");
    mkdirSync(siteRoot, { recursive: true });

    const context = silentCommandContext();
    await sitesRegistryAddCommand(options({
      siteId: "retirable-site",
      root: siteRoot,
      source: "manual",
      apply: true,
    }), context);

    const retired = await sitesRegistryStateCommand("retire", {
      reference: "retirable-site",
      reason: "no longer active",
      format: "json",
      apply: true,
    }, context);
    expect(retired.exitCode).toBe(0);
    expect((retired.result as { after: { lifecycle_status: string } }).after.lifecycle_status).toBe("retired");

    const restored = await sitesRegistryStateCommand("restore", {
      reference: "retirable-site",
      reason: "return to active catalog",
      format: "json",
      apply: true,
    }, context);
    expect(restored.exitCode).toBe(0);
    expect((restored.result as { after: { lifecycle_status: string } }).after.lifecycle_status).toBe("active");

    await sitesRegistryStateCommand("retire", {
      reference: "retirable-site",
      reason: "prepare purge",
      format: "json",
      apply: true,
    }, context);
    const purged = await sitesRegistryStateCommand("purge", {
      reference: "retirable-site",
      reason: "remove stale metadata",
      confirmSiteId: "retirable-site",
      format: "json",
      apply: true,
    }, context);
    expect(purged.exitCode).toBe(0);
    expect((purged.result as { after: unknown }).after).toBeNull();
    expect(existsSync(siteRoot)).toBe(true);
  });

  it("keeps discovery preview non-mutating and reports one candidate across variants", async () => {
    tempRoot = createTempRoot();
    process.env.NARADA_USER_SITE_ROOT = join(tempRoot, "user-site");
    mkdirSync(process.env.NARADA_USER_SITE_ROOT, { recursive: true });
    const sitesRoot = join(tempRoot, "sites");
    const siteRoot = join(sitesRoot, "discoverable-site");
    mkdirSync(siteRoot, { recursive: true });
    writeFileSync(join(siteRoot, "config.json"), JSON.stringify({ aim: { name: "Discoverable" } }), "utf8");
    process.env.NARADA_SITE_ROOT = sitesRoot;

    const context = silentCommandContext();
    const preview = await sitesRegistryDiscoverCommand({
      source: "filesystem",
      root: siteRoot,
      format: "json",
      dryRun: true,
    }, context);
    const previewResult = preview.result as { counts: { added: number }; mutation_performed: boolean };
    expect(preview.exitCode).toBe(0);
    expect(previewResult.counts.added).toBe(1);
    expect(previewResult.mutation_performed).toBe(false);

    const listedBeforeApply = await sitesRegistryListCommand({ format: "json" }, context);
    expect((listedBeforeApply.result as { count: number }).count).toBe(0);

    const applied = await sitesRegistryDiscoverCommand({
      source: "filesystem",
      root: siteRoot,
      format: "json",
      apply: true,
    }, context);
    expect(applied.exitCode).toBe(0);
    expect((applied.result as { mutation_performed: boolean }).mutation_performed).toBe(true);
  });
});
