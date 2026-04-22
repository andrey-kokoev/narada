/**
 * Site Observation API — read-only interface for querying a single Site's state.
 *
 * The cross-site aggregator uses this interface to inspect each Site without
 * mutating any durable state.
 */

import type { SiteHealthRecord } from "./types.js";

/** A stuck work item that needs operator attention. */
export interface StuckWorkItem {
  work_item_id: string;
  scope_id: string;
  status: "failed_retryable" | "leased" | "executing";
  context_id: string;
  last_updated_at: string;
  summary: string;
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
}
