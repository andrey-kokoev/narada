import { describe, expect, it } from "vitest";
import { createWindowsSiteContinuityReadModel } from "../../src/site-observation.js";

describe("createWindowsSiteContinuityReadModel", () => {
  it("projects same-Site continuity for local Windows and Cloudflare embodiments", () => {
    const continuity = createWindowsSiteContinuityReadModel({
      site_id: "site_fixture",
      local_windows_site_ref: "windows://site/site_fixture",
      cloudflare_site_ref: "https://carrier.example/site/site_fixture",
      local_windows_authority_locus: "windows-authority:site_fixture",
      cloudflare_authority_locus: "cloudflare-authority:site_fixture",
      authority_map_ref: "site-authority-map:v1:site_fixture",
    });

    expect(continuity.binding.schema).toBe("narada.site_continuity_binding.v1");
    expect(continuity.binding.site_id).toBe("site_fixture");
    expect(continuity.binding.relation_kind).toBe("same_site_embodiment");
    expect(continuity.binding.embodiments.map((embodiment) => embodiment.embodiment_kind)).toEqual([
      "local_windows",
      "cloudflare_carrier",
    ]);

    const identity = continuity.decisions.find((decision) => decision.exchange_class === "site_identity_binding");
    expect(identity?.action).toBe("admit");
    expect(identity?.source_authority_locus).toBe("windows-authority:site_fixture");
    expect(identity?.target_authority_locus).toBe("cloudflare-authority:site_fixture");
    expect(continuity.exchange_packet.schema).toBe("narada.site_continuity_exchange_packet.v1");
    expect(continuity.exchange_packet.source_embodiment_kind).toBe("local_windows");
    expect(continuity.exchange_packet.target_embodiment_kind).toBe("cloudflare_carrier");
    expect(continuity.exchange_packet_admission.action).toBe("projection_only");
  });

  it("allows projection and evidence exchange without cross-embodiment mutation execution", () => {
    const continuity = createWindowsSiteContinuityReadModel({ site_id: "site_fixture" });

    const authorityProjection = continuity.decisions.find((decision) => decision.exchange_class === "authority_map_projection");
    expect(authorityProjection?.action).toBe("projection_only");

    const evidenceReference = continuity.decisions.find((decision) => decision.exchange_class === "mutation_evidence_reference");
    expect(evidenceReference?.action).toBe("evidence_only");

    const mutationExecution = continuity.decisions.find((decision) => decision.exchange_class === "cross_embodiment_mutation_execution");
    expect(mutationExecution?.action).toBe("refuse");
    expect(mutationExecution?.reason).toBe("site_continuity_cross_embodiment_mutation_execution_refused");
  });
});
