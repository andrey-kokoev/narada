import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  planHostedTelemetryDeployPreflight,
  verifyHostedTelemetrySurface,
} from "../src/deploy-readiness.js";

const exampleWrangler = readFileSync(new URL("../wrangler.example.jsonc", import.meta.url), "utf8");

describe("hosted telemetry deploy readiness", () => {
  it("reports missing wrangler auth without planning Cloudflare mutation", () => {
    const result = planHostedTelemetryDeployPreflight({
      wranglerConfigText: exampleWrangler,
      env: {},
    });

    expect(result.status).toBe("blocked");
    expect(result.deploy_mutation_planned).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      name: "wrangler_auth_reference_present",
      status: "fail",
    }));
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("reports placeholder storage bindings in the committed wrangler example", () => {
    const result = planHostedTelemetryDeployPreflight({
      wranglerConfigText: exampleWrangler,
      env: { WRANGLER_AUTH_READY: "1" },
    });

    expect(result.status).toBe("blocked");
    expect(result.placeholder_bindings).toEqual([
      "NARADA_SITE_REGISTRY_KV",
      "NARADA_SITE_REGISTRY_D1",
    ]);
    expect(result.live_deploy_gated).toBe(true);
  });

  it("passes preflight for non-placeholder bindings and declares build/deploy commands", () => {
    const result = planHostedTelemetryDeployPreflight({
      wranglerConfigText: exampleWrangler
        .replace("<kv_namespace_id>", "kv_live_id")
        .replace("<d1_database_id>", "d1_live_id"),
      env: { WRANGLER_AUTH_READY: "1" },
    });

    expect(result.status).toBe("ready");
    expect(result.build_command).toBe("pnpm --filter @narada2/site-registry-cloudflare build");
    expect(result.deploy_command).toContain("wrangler deploy");
    expect(result.deploy_mutation_planned).toBe(false);
  });

  it("verifies an already deployed surface by reading health without mutation", async () => {
    const result = await verifyHostedTelemetrySurface({
      surfaceUrl: "https://telemetry.example",
      fetch: (async (input) => {
        expect(String(input)).toBe("https://telemetry.example/health");
        return Response.json({
          schema: "narada.site_registry_cloudflare.health.v0",
          status: "ok",
          mode: "projection_only",
        });
      }) as typeof fetch,
    });

    expect(result).toMatchObject({
      schema: "narada.site_telemetry.hosted_surface_verification.v0",
      status: "verified",
      health_status: 200,
      live_network_performed: true,
      cloudflare_mutation_performed: false,
      raw_secret_values_recorded: false,
    });
    expect(result.response_summary).toEqual({
      schema: "narada.site_registry_cloudflare.health.v0",
      status: "ok",
      mode: "projection_only",
    });
  });
});
