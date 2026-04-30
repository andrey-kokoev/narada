/**
 * Build `ScopeConfig` objects from user intents.
 */

import type {
  AllowedAction,
  AttachmentPolicy,
  BodyPolicy,
  MailParticipantField,
  ScopeConfig,
} from "@narada2/control-plane";
import type { PosturePreset } from "../intents/posture.js";
import { resolvePostureActions } from "../intents/posture.js";
import type { ClientServiceMaterialNotesPosture } from "../intents/mailbox.js";

const DEFAULT_MAIL_FOLDERS = ["inbox"];
const DEFAULT_POLLING_MS = 60_000;
const DEFAULT_PARTICIPANT_FIELDS: MailParticipantField[] = ["from", "sender", "to", "cc", "bcc"];

function participantFields(fields?: string[]): MailParticipantField[] {
  if (!fields || fields.length === 0) return DEFAULT_PARTICIPANT_FIELDS;
  const valid = new Set<MailParticipantField>(["from", "sender", "to", "cc", "bcc", "any_participant"]);
  const normalized = fields.map((field) => field.trim()).filter(Boolean);
  const invalid = normalized.filter((field) => !valid.has(field as MailParticipantField));
  if (invalid.length > 0) {
    throw new Error(`Invalid participant field(s): ${invalid.join(", ")}. Valid fields: ${[...valid].join(", ")}`);
  }
  return normalized as MailParticipantField[];
}

/** Build a mailbox ScopeConfig. */
export function buildMailboxScope(opts: {
  scopeId: string;
  graphUserId: string;
  dataRootDir: string;
  folders?: string[];
  primaryCharter?: string;
  secondaryCharters?: string[];
  posture?: PosturePreset;
  allowedActions?: AllowedAction[];
  clientService?: boolean;
  correspondenceScopeId?: string;
  participantDomains?: string[];
  excludedParticipantDomains?: string[];
  participantFields?: string[];
  attachmentPolicy?: AttachmentPolicy;
  bodyPolicy?: BodyPolicy;
  includeHeaders?: boolean;
  materialNotesPosture?: ClientServiceMaterialNotesPosture;
}): ScopeConfig {
  const allowedActions =
    opts.allowedActions ?? resolvePostureActions(opts.posture ?? "draft-only", "mail");
  const fields = participantFields(opts.participantFields);
  const includeDomains = opts.participantDomains?.map((domain) => domain.trim().toLowerCase()).filter(Boolean) ?? [];
  const excludeDomains = opts.excludedParticipantDomains?.map((domain) => domain.trim().toLowerCase()).filter(Boolean) ?? [];

  const scope: ScopeConfig = {
    scope_id: opts.scopeId,
    root_dir: opts.dataRootDir,
    sources: [{ type: "graph", user_id: opts.graphUserId }],
    context_strategy: "mail",
    scope: {
      included_container_refs: opts.folders ?? DEFAULT_MAIL_FOLDERS,
      included_item_kinds: ["message"],
    },
    normalize: {
      attachment_policy: opts.attachmentPolicy ?? "metadata_only",
      body_policy: opts.bodyPolicy ?? "text_only",
      include_headers: opts.includeHeaders ?? false,
      tombstones_enabled: true,
    },
    runtime: {
      polling_interval_ms: DEFAULT_POLLING_MS,
      acquire_lock_timeout_ms: 30_000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
      rebuild_search_after_sync: false,
    },
    policy: {
      primary_charter: opts.primaryCharter ?? "support_steward",
      secondary_charters: opts.secondaryCharters,
      allowed_actions: allowedActions,
      require_human_approval: true,
    },
  };

  if (includeDomains.length > 0 || excludeDomains.length > 0) {
    scope.admission = {
      mail: {
        predicates: {
          include: includeDomains.length > 0
            ? [{ kind: "participant", fields, domains: includeDomains }]
            : undefined,
          exclude: excludeDomains.length > 0
            ? [{ kind: "participant", fields, domains: excludeDomains }]
            : undefined,
          unknown_participant_behavior: "ignore",
        },
      },
    };
  }

  if (opts.clientService) {
    scope.client_service = {
      enabled: true,
      correspondence_scope_id: opts.correspondenceScopeId ?? opts.scopeId,
      mailbox_user_id: opts.graphUserId,
      draft_send_posture: opts.posture ?? "draft-only",
      material_notes_posture: opts.materialNotesPosture ?? "deferred",
    };
  }

  return scope;
}

/** Build a timer workflow ScopeConfig. */
export function buildWorkflowScope(opts: {
  scopeId: string;
  workflowId: string;
  schedule: string;
  dataRootDir: string;
  primaryCharter?: string;
  posture?: PosturePreset;
  allowedActions?: AllowedAction[];
}): ScopeConfig {
  const allowedActions =
    opts.allowedActions ?? resolvePostureActions(opts.posture ?? "observe-only", "timer");

  return {
    scope_id: opts.scopeId,
    root_dir: opts.dataRootDir,
    sources: [{ type: "timer", schedule: opts.schedule } as any],
    context_strategy: "timer",
    scope: {
      included_container_refs: ["timer"],
      included_item_kinds: ["timer_event"],
    },
    normalize: {
      attachment_policy: "exclude",
      body_policy: "text_only",
      include_headers: false,
      tombstones_enabled: false,
    },
    runtime: {
      polling_interval_ms: DEFAULT_POLLING_MS,
      acquire_lock_timeout_ms: 30_000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
      rebuild_search_after_sync: false,
    },
    policy: {
      primary_charter: opts.primaryCharter ?? "support_steward",
      allowed_actions: allowedActions,
    },
  };
}
