import { describe, it, expect } from "vitest";
import {
  validateSiteManifest,
  validateSiteManifestOrThrow,
  isValidSiteManifest,
  SiteManifestSchema,
  SiteGovernanceCoordinatesSchema,
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

const validGovernance = {
  governing_law_source: {
    source_site_id: "narada-proper",
    law_artifacts: ["AGENTS.md", "SEMANTICS.md"],
    mode: "inherited" as const,
    admission: "declared" as const,
  },
  law_admission_mode: "local_overlay" as const,
  authority_locus: {
    locus_kind: "project" as const,
    authority_site_id: "help-global-maxima",
    mutation_policy: "direct_only_at_locus" as const,
  },
  embodiments: [
    {
      embodiment_id: "wsl-authority",
      role: "authority" as const,
      root: "/home/andrey/src/site",
      substrate: "filesystem",
      mutation_policy: "may_mutate_at_authority_locus" as const,
    },
  ],
  mutation_evidence_locus: {
    kind: "git" as const,
    path: ".",
  },
  inbox_sources: [
    {
      source_id: "canonical-file-drop",
      kind: "file_drop" as const,
      path: ".ai/inbox-drop",
      admission: "inert_until_promoted" as const,
    },
  ],
  outbox_targets: [
    {
      target_id: "canonical-envelope-export",
      kind: "git_export" as const,
      authority: "handoff_only" as const,
    },
  ],
  effect_authority_policy: "metadata_only" as const,
  capability_grants: [
    {
      capability_id: "mail-draft",
      source: "credential_store" as const,
      scope: "draft_reply",
    },
  ],
  lineage_source: {
    kind: "git_history" as const,
    path: ".git",
  },
  readiness_phase: "inhabited_onboarding" as const,
  operator_identity: {
    principal_id: "operator",
    role: "Operator" as const,
  },
  agent_identity_contract: {
    default_agent_name: "architect",
    operator_label: "Operator",
    contract_path: "AGENTS.md",
  },
  local_overlays: [
    {
      overlay_id: "site-local-contract",
      path: "AGENTS.md",
      admission: "site_local" as const,
    },
  ],
  federation_policy: {
    posture: "receive_only" as const,
    admission: "local_admission_required" as const,
  },
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

  it("accepts explicit Site governance coordinates", () => {
    const result = validateSiteManifest({
      ...validManifest,
      governance: validGovernance,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.governance?.governing_law_source.source_site_id).toBe("narada-proper");
      expect(result.data.governance?.effect_authority_policy).toBe("metadata_only");
      expect(result.data.governance?.mutation_evidence_locus.required).toBe(true);
      expect(result.data.governance?.capability_grants[0]?.grants_effect_authority).toBe(false);
    }
  });

  it("accepts doctrine imports as binding declarations without embedding interpretation", () => {
    const result = SiteGovernanceCoordinatesSchema.safeParse({
      ...validGovernance,
      doctrine_imports: [
        {
          import_id: "fda-qmsr-21-cfr-820",
          kind: "regulation",
          authority: {
            authority_kind: "regulator",
            issuer: "FDA",
            jurisdiction: "US",
            authority_ref: "21 CFR Part 820",
          },
          citation: {
            title: "Quality Management System Regulation",
            source_uri: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820",
            effective_date: "2026-02-02",
          },
          binding_scope: {
            site_wide: true,
            operation_kinds: ["capa"],
            task_gate_kinds: ["review", "closure"],
            capability_kinds: ["quality_record"],
          },
          applicability: {
            default: "candidate",
            predicates: ["site.handles_medical_device_quality_records == true"],
          },
          inheritance: {
            mode: "inherit_to_operations",
            override_policy: "operator_confirmed",
          },
          binding_posture: "binding_gate",
          interpretation_locus: {
            kind: "knowledge_base",
            ref: "kb://quality/fda-qmsr",
          },
          admission: {
            admitted_by: "operator",
            evidence_ref: "env_fda_qmsr_admission",
          },
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.doctrine_imports[0]?.interpretation_locus.kind).toBe("knowledge_base");
      expect(result.data.doctrine_imports[0]?.binding_posture).toBe("binding_gate");
    }
  });

  it("rejects arbitrary governance coordinate values", () => {
    const result = SiteGovernanceCoordinatesSchema.safeParse({
      ...validGovernance,
      readiness_phase: "whatever-next",
    });

    expect(result.success).toBe(false);
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
