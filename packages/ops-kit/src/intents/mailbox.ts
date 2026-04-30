/**
 * Intent types for `ops-kit want mailbox`.
 *
 * These capture the user voice "I want Narada to assist this mailbox"
 * and shape it into Narada structure.
 */

import type { PosturePreset } from "./posture.js";

export type ClientServiceMaterialNotesPosture = "none" | "site_local_kb" | "deferred" | string;

/** User intent to create or update a mailbox scope. */
export interface WantMailboxIntent {
  /** Mailbox identifier (e.g. helpdesk@example.com). */
  mailboxId: string;

  /** Primary charter to bind. */
  primaryCharter?: string;

  /** Secondary charters to bind. */
  secondaryCharters?: string[];

  /** Safety posture preset. */
  posture?: PosturePreset;

  /** Graph API user ID (defaults to mailboxId). */
  graphUserId?: string;

  /** Graph/mailbox user ID alias used by client-service onboarding. */
  mailboxUserId?: string;

  /** Explicit correspondence scope ID. Defaults to mailboxId. */
  correspondenceScopeId?: string;

  /** Sync folders. */
  folders?: string[];

  /** Admission participant domains matched across configured participant fields. */
  participantDomains?: string[];

  /** Admission participant domains to exclude. */
  excludedParticipantDomains?: string[];

  /** Participant fields to evaluate for domain predicates. */
  participantFields?: string[];

  /** Attachment normalization policy. */
  attachmentPolicy?: string;

  /** Body normalization policy. */
  bodyPolicy?: string;

  /** Whether to include headers during normalization. */
  includeHeaders?: boolean;

  /** Site-local KB/material note posture for client-service onboarding. */
  materialNotesPosture?: ClientServiceMaterialNotesPosture;

  /** Data directory root. */
  rootDir?: string;

  /** Whether to create the directory scaffold. */
  scaffold?: boolean;
}

/** Result of shaping a mailbox intent. */
export interface ShapedMailbox {
  /** The scope_id that will be used. */
  scopeId: string;

  /** The context_id that will be used. */
  contextId: string;

  /** Paths that will be created or touched. */
  touchedPaths: string[];

  /** Summary of the resulting configuration. */
  summary: string;

  /** Suggested next steps in the bootstrap contract. */
  nextSteps: string[];

  /** Whether the target already existed. */
  existed: boolean;
}
