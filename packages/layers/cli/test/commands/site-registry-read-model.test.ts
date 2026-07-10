import { beforeEach, describe, expect, it, vi } from "vitest";

const sitesRegistryListCommand = vi.fn();
const sitesRegistryShowCommand = vi.fn();
const sitesRegistryDiscoverCommand = vi.fn();

vi.mock("../../src/commands/site-registry-management.js", () => ({
  sitesRegistryListCommand,
  sitesRegistryShowCommand,
  sitesRegistryDiscoverCommand,
}));

const { createSiteRegistryReadModel } = await import("../../src/commands/site-registry-read-model.js");

describe("Site Registry read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sitesRegistryListCommand.mockResolvedValue({ exitCode: 0, result: { operation: "list" } });
    sitesRegistryShowCommand.mockResolvedValue({ exitCode: 0, result: { operation: "show" } });
    sitesRegistryDiscoverCommand.mockResolvedValue({ exitCode: 0, result: { operation: "discover", mutation_performed: false } });
  });

  it("maps browser reads to the canonical registry command envelopes", async () => {
    const model = createSiteRegistryReadModel();

    await model.list();
    await model.show("legacy-alias");
    await model.discoverPlan({ source: "filesystem", root: "D:/code", actor: "operator" });

    expect(sitesRegistryListCommand).toHaveBeenCalledWith({ format: "json" }, expect.any(Object));
    expect(sitesRegistryShowCommand).toHaveBeenCalledWith({ format: "json", reference: "legacy-alias" }, expect.any(Object));
    expect(sitesRegistryDiscoverCommand).toHaveBeenCalledWith({
      format: "json",
      source: "filesystem",
      root: "D:/code",
      actor: "operator",
      dryRun: true,
      apply: false,
    }, expect.any(Object));
  });
});