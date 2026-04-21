import type { CloudflareEnv } from "../../src/coordinator.js";
import { createSiteFixture, type SiteFixture } from "./site.js";
import handler from "../../src/index.js";

export interface CycleFixture {
  site: SiteFixture;
  env: CloudflareEnv;
  invoke(body: { scope_id: string; context_id?: string; correlation_id?: string }): Promise<Response>;
}

export function createCycleFixture(siteId: string): CycleFixture {
  const site = createSiteFixture(siteId);
  const env: CloudflareEnv = {
    NARADA_SITE_COORDINATOR: {
      idFromName: () => ({ toString: () => "mock-id" }),
      get: () => site.coordinator as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    NARADA_ADMIN_TOKEN: "test-token",
  };

  return {
    site,
    env,
    async invoke(body) {
      const request = new Request("http://localhost/cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return handler.fetch(request, env, {} as ExecutionContext);
    },
  };
}
