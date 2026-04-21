import { describe, it, expect } from "vitest";
import {
  validateSiteManifest,
  validateSiteManifestOrThrow,
  isValidSiteManifest,
  SiteManifestSchema,
} from "../../../src/config/site-manifest.js";

const validManifest = {
  site_id: "help-global-maxima",
  substrate: "cloudflare-workers-do-sandbox" as const,
  aim: {
    name: "Support response automation",
    description: "Draft replies to customer support emails",
    vertical: "mailbox" as const,
  },
  cloudflare: {
    worker_name: "narada-help-global-maxima",
    do_namespace: "NARADA_SITE_HELP_GLOBAL_MAXIMA",
    r2_bucket: "narada-traces-help-global-maxima",
    cron_schedule: "*/5 * * * *",
    secret_prefix: "NARADA_HELP_",
  },
  policy: {
    primary_charter: "support_steward",
    allowed_actions: ["draft_reply", "mark_read", "no_action"] as const,
    require_human_approval: true,
  },
  sources: [
    {
      type: "graph" as const,
      user_id: "help@global-maxima.com",
      prefer_immutable_ids: true,
    },
  ],
};

describe("SiteManifest validation", () => {
  it("accepts a valid manifest", () => {
    const result = validateSiteManifest(validManifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.site_id).toBe("help-global-maxima");
      expect(result.data.substrate).toBe("cloudflare-workers-do-sandbox");
      expect(result.data.aim.name).toBe("Support response automation");
      expect(result.data.cloudflare.cron_schedule).toBe("*/5 * * * *");
      expect(result.data.policy.allowed_actions).toContain("draft_reply");
    }
  });

  it("rejects an invalid substrate", () => {
    const result = validateSiteManifest({
      ...validManifest,
      substrate: "aws-lambda",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("cloudflare-workers-do-sandbox"))).toBe(true);
    }
  });

  it("rejects a non-URL-safe site_id", () => {
    const result = validateSiteManifest({
      ...validManifest,
      site_id: "help@global",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("URL-safe"))).toBe(true);
    }
  });

  it("rejects an invalid cron expression", () => {
    const result = validateSiteManifest({
      ...validManifest,
      cloudflare: {
        ...validManifest.cloudflare,
        cron_schedule: "not-a-cron",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("Cron"))).toBe(true);
    }
  });

  it("rejects empty allowed_actions", () => {
    const result = validateSiteManifest({
      ...validManifest,
      policy: {
        ...validManifest.policy,
        allowed_actions: [],
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("allowed action"))).toBe(true);
    }
  });

  it("rejects missing aim description", () => {
    const result = validateSiteManifest({
      ...validManifest,
      aim: { name: "X", description: "" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("description"))).toBe(true);
    }
  });

  it("rejects missing sources", () => {
    const result = validateSiteManifest({
      ...validManifest,
      sources: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("source"))).toBe(true);
    }
  });

  it("validateSiteManifestOrThrow returns data on success", () => {
    const data = validateSiteManifestOrThrow(validManifest);
    expect(data.site_id).toBe("help-global-maxima");
  });

  it("validateSiteManifestOrThrow throws on failure", () => {
    expect(() =>
      validateSiteManifestOrThrow({
        ...validManifest,
        site_id: "bad id!",
      }),
    ).toThrow("Site manifest validation failed");
  });

  it("isValidSiteManifest returns true for valid manifest", () => {
    expect(isValidSiteManifest(validManifest)).toBe(true);
  });

  it("isValidSiteManifest returns false for invalid manifest", () => {
    expect(isValidSiteManifest({ site_id: "x" })).toBe(false);
  });

  it("Schema parses with defaults", () => {
    const result = SiteManifestSchema.safeParse({
      site_id: "test-site",
      substrate: "cloudflare-workers-do-sandbox",
      aim: { name: "Test", description: "Test aim" },
      cloudflare: {
        worker_name: "test-worker",
        do_namespace: "TEST_DO",
        r2_bucket: "test-bucket",
        cron_schedule: "0 * * * *",
        secret_prefix: "TEST_",
      },
      policy: { allowed_actions: ["no_action"] },
      sources: [{ type: "graph", user_id: "u@example.com" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aim.vertical).toBe("mailbox");
      expect(result.data.policy.require_human_approval).toBe(true);
      expect(result.data.policy.primary_charter).toBe("support_steward");
    }
  });
});
