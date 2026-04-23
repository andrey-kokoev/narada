import { describe, it, expect } from "vitest";
import { windowsSiteAdapter } from "../../src/console-adapter.js";
import type { RegisteredSite } from "../../src/registry.js";

function makeSite(overrides: Partial<RegisteredSite> = {}): RegisteredSite {
  return {
    siteId: "test-site",
    variant: "wsl",
    siteRoot: "/tmp/test-site",
    substrate: "windows",
    aimJson: null,
    controlEndpoint: null,
    lastSeenAt: null,
    createdAt: "2026-04-20T10:00:00Z",
    ...overrides,
  };
}

describe("windowsSiteAdapter", () => {
  describe("supports", () => {
    it("returns true for native variant", () => {
      expect(windowsSiteAdapter.supports(makeSite({ variant: "native" }))).toBe(true);
    });

    it("returns true for wsl variant", () => {
      expect(windowsSiteAdapter.supports(makeSite({ variant: "wsl" }))).toBe(true);
    });

    it("returns false for cloudflare variant", () => {
      expect(windowsSiteAdapter.supports(makeSite({ variant: "cloudflare" }))).toBe(false);
    });

    it("returns false for unknown variant", () => {
      expect(windowsSiteAdapter.supports(makeSite({ variant: "unknown" as any }))).toBe(false);
    });
  });
});
