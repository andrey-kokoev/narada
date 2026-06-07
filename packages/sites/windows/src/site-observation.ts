/**
 * Site Observation API — read-only interface for querying a single Site's state.
 *
 * The cross-site aggregator uses this interface to inspect each Site without
 * mutating any durable state.
 */

import type { SiteHealthRecord } from "./types.js";
import {
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  SITE_CONTINUITY_EXCHANGE_CLASSES,
  classifySiteContinuityExchangePacket,
  classifySiteContinuityExchange,
  createSiteContinuityExchangePacket,
  createSiteContinuityBinding,
  type SiteContinuityBinding,
  type SiteContinuityDecision,
  type SiteContinuityExchangePacket,
} from "@narada2/site-continuity";

/** A stuck work item that needs operator attention. */
export interface StuckWorkItem {
  work_item_id: string;
  scope_id: string;
  status: "failed_retryable" | "leased" | "executing";
  context_id: string;
  last_updated_at: string;
  summary: string;
}

/** Input for a Windows-local same-Site continuity projection. */
export interface WindowsSiteContinuityInput {
  site_id: string;
  local_windows_site_ref?: string;
  cloudflare_site_ref?: string;
  local_windows_authority_locus?: string;
  cloudflare_authority_locus?: string;
  authority_map_ref?: string | null;
  relation_id?: string | null;
  generated_at?: string | null;
}

/** Read model that lets Windows expose same-Site continuity without remote mutation authority. */
export interface WindowsSiteContinuityReadModel {
  binding: SiteContinuityBinding;
  decisions: SiteContinuityDecision[];
  exchange_packet: SiteContinuityExchangePacket;
  exchange_packet_admission: SiteContinuityDecision;
}

export function createWindowsSiteContinuityReadModel(input: WindowsSiteContinuityInput): WindowsSiteContinuityReadModel {
  const binding = createSiteContinuityBinding({
    site_id: input.site_id,
    local_windows_site_ref: input.local_windows_site_ref ?? "local-windows-site",
    cloudflare_site_ref: input.cloudflare_site_ref ?? "cloudflare-site",
    local_windows_authority_locus: input.local_windows_authority_locus ?? "local-windows-site-authority",
    cloudflare_authority_locus: input.cloudflare_authority_locus ?? "cloudflare-carrier",
    authority_map_ref: input.authority_map_ref ?? "site-authority-map:v1",
    relation_id: input.relation_id ?? null,
    generated_at: input.generated_at ?? null,
  });
  const fromWindowsToCloudflare = {
    site_id: input.site_id,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
  };
  const fromCloudflareToWindows = {
    site_id: input.site_id,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
  };
  const decisions = [
      classifySiteContinuityExchange(binding, {
        ...fromWindowsToCloudflare,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.SITE_IDENTITY_BINDING,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromWindowsToCloudflare,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.AUTHORITY_MAP_PROJECTION,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromWindowsToCloudflare,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromWindowsToCloudflare,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.MUTATION_EVIDENCE_REFERENCE,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromCloudflareToWindows,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.CROSS_EMBODIMENT_MUTATION_EXECUTION,
      }),
    ];
  const exchangePacket = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    decisions,
    projections: [{
      projection_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
      source_cursor: input.generated_at ?? "windows-continuity-read-model",
      summary: "Windows Site continuity read-model projection",
    }],
    evidence_refs: [],
    generated_at: input.generated_at ?? null,
  });
  return {
    binding,
    decisions,
    exchange_packet: exchangePacket,
    exchange_packet_admission: classifySiteContinuityExchangePacket(exchangePacket),
  };
}

/** A pending outbound command that needs operator attention. */
export interface PendingOutboundCommand {
  outbound_id: string;
  scope_id: string;
  context_id: string;
  action_type: string;
  status: string;
  created_at: string;
  summary: string;
}

/** A pending draft awaiting operator approval. */
export interface PendingDraft {
  draft_id: string;
  scope_id: string;
  context_id: string;
  status: "draft_ready" | "pending_approval";
  created_at: string;
  summary: string;
}

/** A credential requirement that needs operator action. */
export interface CredentialRequirement {
  requirement_id: string;
  scope_id: string;
  subtype: "interactive_auth_required" | "token_refresh" | "certificate_renewal";
  summary: string;
  /**
   * Remediation command with placeholders (e.g. `<tenant-id>`).
   * Never contains actual secret material.
   */
  remediation_command: string;
  remediation_description: string;
  requested_at: string;
}

/**
 * Read-only observation API for a single Site.
 */
export interface SiteObservationApi {
  /** Current health record for the Site. */
  getHealth(): Promise<SiteHealthRecord> | SiteHealthRecord;
  /** Work items that are stuck and need attention. */
  getStuckWorkItems(): Promise<StuckWorkItem[]> | StuckWorkItem[];
  /** Outbound commands that are pending or failed. */
  getPendingOutboundCommands(): Promise<PendingOutboundCommand[]> | PendingOutboundCommand[];
  /** Drafts awaiting operator approval. */
  getPendingDrafts(): Promise<PendingDraft[]> | PendingDraft[];
  /** Credential requirements that need operator intervention. */
  getCredentialRequirements(): Promise<CredentialRequirement[]> | CredentialRequirement[];
  /** Same-Site continuity projection for sibling embodiments, if configured. */
  getSiteContinuity?(): Promise<WindowsSiteContinuityReadModel> | WindowsSiteContinuityReadModel;
}
