/**
 * `ops-kit want mailbox <mailbox-id>`
 *
 * Shape "I want Narada to assist this mailbox" into mailbox-owned Narada objects.
 */

import fs from "node:fs";
import path from "node:path";
import {
  ensureConfig,
  findScope,
  getOpsRepoRoot,
  upsertScope,
  writeConfig,
} from "../lib/config-io.js";
import { scaffoldGlobal, scaffoldMailbox } from "../lib/scaffold.js";
import { buildMailboxScope } from "../lib/scope-builder.js";
import type { ShapedMailbox } from "../intents/mailbox.js";
import { resolvePostureActions } from "../intents/posture.js";
import type { PosturePreset } from "../intents/posture.js";

export interface WantMailboxOptions {
  configPath?: string;
  scopeId?: string;
  primaryCharter?: string;
  secondaryCharters?: string[];
  posture?: string;
  graphUserId?: string;
  mailboxUserId?: string;
  correspondenceScopeId?: string;
  folders?: string[];
  dataRootDir?: string;
  clientService?: boolean;
  participantDomains?: string[];
  excludedParticipantDomains?: string[];
  participantFields?: string[];
  attachmentPolicy?: string;
  bodyPolicy?: string;
  includeHeaders?: boolean;
  materialNotesPosture?: string;
  scaffold?: boolean;
}

export function wantMailbox(
  mailboxId: string,
  options: WantMailboxOptions
): ShapedMailbox {
  const config = ensureConfig(options.configPath);
  const opsRoot = getOpsRepoRoot(options.configPath);
  const dataRoot =
    options.dataRootDir ??
    path.join(config.root_dir, mailboxId.replace(/[@.]/g, "-"));
  const scopeId = options.scopeId ?? options.correspondenceScopeId ?? mailboxId;
  const contextId = `mail:${mailboxId}`;
  const existed = !!findScope(config, scopeId);

  const posture = (options.posture ?? "draft-only") as PosturePreset;
  const mailboxUserId = options.mailboxUserId ?? options.graphUserId ?? mailboxId;

  const scope = buildMailboxScope({
    scopeId,
    graphUserId: mailboxUserId,
    dataRootDir: dataRoot,
    folders: options.folders,
    primaryCharter: options.primaryCharter,
    secondaryCharters: options.secondaryCharters,
    posture,
    clientService: options.clientService,
    correspondenceScopeId: options.correspondenceScopeId ?? scopeId,
    participantDomains: options.participantDomains,
    excludedParticipantDomains: options.excludedParticipantDomains,
    participantFields: options.participantFields,
    attachmentPolicy: options.attachmentPolicy as any,
    bodyPolicy: options.bodyPolicy as any,
    includeHeaders: options.includeHeaders,
    materialNotesPosture: options.materialNotesPosture,
  });

  upsertScope(config, scope);
  writeConfig(config, options.configPath);

  const configPath = options.configPath ?? "./config/config.json";
  const touchedPaths: string[] = [configPath];

  if (options.scaffold !== false) {
    touchedPaths.push(...scaffoldGlobal(opsRoot));
    touchedPaths.push(...scaffoldMailbox(opsRoot, mailboxId));
  }

  const readmePath = path.join(opsRoot, "mailboxes", mailboxId, "README.md");
  if (fs.existsSync(readmePath)) {
    const lines = [
      `# ${mailboxId}`,
      "",
      "Mailbox-owned operational material.",
      "",
      `- primary charter: \`${scope.policy.primary_charter}\``,
      ...(scope.policy.secondary_charters?.length
        ? [
            `- secondary charters: ${scope.policy.secondary_charters.map((c) => `\`${c}\``).join(", ")}`,
          ]
        : []),
      `- posture: \`${posture}\``,
      ...(options.clientService
        ? [
            `- client-service mailbox user id: \`${mailboxUserId}\``,
            `- correspondence scope: \`${scopeId}\``,
            `- material notes posture: \`${scope.client_service?.material_notes_posture ?? "deferred"}\``,
          ]
        : []),
      `- data root: \`${scope.root_dir}\``,
      "",
      "## Contents",
      "",
      "- `scenarios/`",
      "- `knowledge/`",
      "- `notes/`",
      "",
    ].join("\n");
    fs.writeFileSync(readmePath, lines, "utf-8");
  }

  const allowed = resolvePostureActions(posture, "mail");

  return {
    scopeId,
    contextId,
    touchedPaths,
    existed,
    summary:
      `Mailbox ${mailboxId} ${existed ? "updated" : "created"}. ` +
      `Primary charter: ${scope.policy.primary_charter}. ` +
      `Posture: ${posture} (${allowed.length} allowed actions). ` +
      (options.clientService ? `Client-service scope: ${scopeId}. ` : "") +
      `Folders: ${scope.scope.included_container_refs.join(", ")}.`,
    nextSteps: [
      "narada setup",
      "cp .env.example .env  # then edit with your credentials",
      `narada preflight ${scopeId}`,
      `narada explain ${scopeId}`,
      `narada activate ${scopeId}`,
      "pnpm daemon",
    ],
  };
}
