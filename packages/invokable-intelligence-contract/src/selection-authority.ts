/**
 * Canonical handoff from launch/control surfaces to invocation-time intelligence resolution.
 *
 * Launchers identify the Site catalog. They never select an inference provider,
 * model, route, or thinking posture.
 */

export const INTELLIGENCE_SELECTION_AUTHORITY_SCHEMA =
  "narada.invokable-intelligence.selection-authority.v1" as const;

export const INTELLIGENCE_SELECTION_AUTHORITATIVE_INPUTS = Object.freeze([
  "invocation-intent",
  "catalog",
  "materialized-policy",
  "runtime-context",
] as const);

export type IntelligenceCatalogStoreKind = "node:sqlite" | "cloudflare:d1";

export interface IntelligenceSelectionAuthority {
  schema: typeof INTELLIGENCE_SELECTION_AUTHORITY_SCHEMA;
  owner: "@narada2/invokable-intelligence-runtime";
  resolution_phase: "runtime-invocation";
  authority_scope: {
    kind: "site";
    site_id: string | null;
  };
  catalog: {
    store_kind: IntelligenceCatalogStoreKind;
    locator: string;
  };
  launcher_selection: false;
  authoritative_inputs: typeof INTELLIGENCE_SELECTION_AUTHORITATIVE_INPUTS;
}

export function createIntelligenceSelectionAuthority(input: {
  siteId?: string | null;
  storeKind: IntelligenceCatalogStoreKind;
  catalogLocator: string;
}): IntelligenceSelectionAuthority {
  const catalogLocator = input.catalogLocator.trim();
  if (!catalogLocator) throw new Error("intelligence_catalog_locator_required");
  return Object.freeze({
    schema: INTELLIGENCE_SELECTION_AUTHORITY_SCHEMA,
    owner: "@narada2/invokable-intelligence-runtime",
    resolution_phase: "runtime-invocation",
    authority_scope: {
      kind: "site",
      site_id: input.siteId?.trim() || null,
    },
    catalog: {
      store_kind: input.storeKind,
      locator: catalogLocator,
    },
    launcher_selection: false,
    authoritative_inputs: INTELLIGENCE_SELECTION_AUTHORITATIVE_INPUTS,
  } as const);
}
