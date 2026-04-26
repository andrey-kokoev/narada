import { describe, expect, it } from "vitest";
import {
  defaultWindowsSiteLocus,
  resolveWindowsSiteLocus,
  validateWindowsSiteLocus,
} from "../../src/authority-locus.js";

describe("Windows Site authority locus", () => {
  it("defaults omitted legacy locus to user", () => {
    const locus = resolveWindowsSiteLocus(undefined);

    expect(locus.authority_locus).toBe("user");
  });

  it("can create a default PC locus without changing path policy", () => {
    const locus = defaultWindowsSiteLocus("pc");

    expect(locus.authority_locus).toBe("pc");
    if (locus.authority_locus === "pc") {
      expect(locus.machine.hostname.length).toBeGreaterThan(0);
      expect(locus.root_posture).toBe("user_owned_pc_site_prototype");
    }
  });

  it("validates explicit user locus", () => {
    const result = validateWindowsSiteLocus({
      authority_locus: "user",
      principal: {
        windows_user_profile: "C:\\Users\\Andrey",
        username: "Andrey",
      },
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("rejects incomplete PC locus", () => {
    const result = validateWindowsSiteLocus({
      authority_locus: "pc",
      machine: {
        hostname: "",
      },
      root_posture: "user_owned_pc_site_prototype",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("pc locus requires machine.hostname");
  });
});
