import { beforeEach, describe, expect, it, vi } from "vitest";

const sitesRegistryAddCommand = vi.fn();
const sitesRegistryEditCommand = vi.fn();
const sitesRegistryStateCommand = vi.fn();

vi.mock("../../src/commands/site-registry-management.js", () => ({
  sitesRegistryAddCommand,
  sitesRegistryEditCommand,
  sitesRegistryStateCommand,
}));

const { createRegistryMutationGateway } = await import("../../src/commands/site-registry-management-gateway.js");

describe("Site Registry management gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sitesRegistryAddCommand.mockResolvedValue({ exitCode: 0, result: { operation: "add" } });
    sitesRegistryEditCommand.mockResolvedValue({ exitCode: 0, result: { operation: "edit" } });
    sitesRegistryStateCommand.mockResolvedValue({ exitCode: 0, result: { operation: "state" } });
  });

  it("maps add previews and applies to canonical explicit modes", async () => {
    const gateway = createRegistryMutationGateway();
    await gateway.plan({ operation: "add", siteId: "site-a", root: "D:/code/site-a", source: "manual" });
    await gateway.apply({ operation: "add", siteId: "site-a", root: "D:/code/site-a", source: "manual" });

    expect(sitesRegistryAddCommand).toHaveBeenNthCalledWith(1, expect.objectContaining({ format: "json", siteId: "site-a", root: "D:/code/site-a", apply: false, dryRun: true }), expect.any(Object));
    expect(sitesRegistryAddCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({ format: "json", siteId: "site-a", root: "D:/code/site-a", apply: true, dryRun: false }), expect.any(Object));
  });

  it("routes edits and lifecycle operations with revision and purge confirmation", async () => {
    const gateway = createRegistryMutationGateway();
    await gateway.apply({ operation: "edit", reference: "legacy-alias", root: "D:/code/new", expectedRevision: 7 });
    await gateway.plan({ operation: "retire", reference: "site-a", reason: "duplicate", expectedRevision: 8 });
    await gateway.apply({ operation: "restore", reference: "site-a", reason: "revalidated", expectedRevision: 9 });
    await gateway.apply({ operation: "purge", reference: "site-a", confirmSiteId: "site-a", expectedRevision: 10 });

    expect(sitesRegistryEditCommand).toHaveBeenCalledWith(expect.objectContaining({ reference: "legacy-alias", expectedRevision: 7, apply: true, dryRun: false }), expect.any(Object));
    expect(sitesRegistryStateCommand).toHaveBeenNthCalledWith(1, "retire", expect.objectContaining({ reference: "site-a", reason: "duplicate", expectedRevision: 8, apply: false, dryRun: true }), expect.any(Object));
    expect(sitesRegistryStateCommand).toHaveBeenNthCalledWith(2, "restore", expect.objectContaining({ reference: "site-a", reason: "revalidated", expectedRevision: 9, apply: true, dryRun: false }), expect.any(Object));
    expect(sitesRegistryStateCommand).toHaveBeenNthCalledWith(3, "purge", expect.objectContaining({ reference: "site-a", confirmSiteId: "site-a", expectedRevision: 10, apply: true, dryRun: false }), expect.any(Object));
  });
});