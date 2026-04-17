/**
 * Send Reply Worker
 *
 * Durable outbound worker for send_reply commands.
 * Handles draft creation, reuse, policy validation, send, and state transitions.
 */

import { createHash } from "node:crypto";
import type { Logger } from "../logging/types.js";
import type { OutboundStore } from "./store.js";
import type {
  OutboundCommand,
  OutboundStatus,
  OutboundVersion,
  ManagedDraft,
} from "./types.js";
import { isVersionEligible, isValidTransition } from "./types.js";
import type { GraphDraftClient, CreateDraftPayload } from "./graph-draft-client.js";
import { ExchangeFSSyncError, ErrorCode } from "../errors.js";

export interface ParticipantResolver {
  getParticipants(mailboxId: string, threadId: string): Promise<Set<string>>;
}

export interface SendReplyWorkerDeps {
  store: OutboundStore;
  draftClient: GraphDraftClient;
  participantResolver: ParticipantResolver;
  resolveUserId: (mailboxId: string) => string;
  logger?: Logger;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function computeBodyHash(version: OutboundVersion): string {
  return sha256(`${version.body_text}\n${version.body_html}`);
}

function computeRecipientsHash(version: OutboundVersion): string {
  return sha256(JSON.stringify({ to: version.to, cc: version.cc, bcc: version.bcc }));
}

function computeSubjectHash(version: OutboundVersion): string {
  return sha256(version.subject);
}

function buildDraftPayload(
  outboundId: string,
  version: OutboundVersion,
): CreateDraftPayload {
  return {
    subject: version.subject,
    body: {
      contentType: version.body_html ? "HTML" : "Text",
      content: version.body_html || version.body_text,
    },
    toRecipients: version.to.map((email) => ({ emailAddress: { address: email } })),
    ccRecipients: version.cc.map((email) => ({ emailAddress: { address: email } })),
    bccRecipients: version.bcc.map((email) => ({ emailAddress: { address: email } })),
    internetMessageHeaders: [
      { name: "X-Outbound-Id", value: outboundId },
    ],
  };
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ExchangeFSSyncError) {
    return error.recoverable;
  }
  return true;
}

function isAuthError(error: unknown): boolean {
  if (error instanceof ExchangeFSSyncError) {
    return error.code === ErrorCode.GRAPH_AUTH_FAILED;
  }
  return false;
}

export class SendReplyWorker {
  constructor(private readonly deps: SendReplyWorkerDeps) {}

  /**
   * Process the next eligible send_reply or draft_reply command.
   * Returns whether a command was processed.
   */
  async processNext(scopeId?: string): Promise<{ processed: boolean; outboundId?: string }> {
    const sendReplyCandidates = this.deps.store.fetchNextByStatus(
      "send_reply",
      ["pending", "draft_creating", "draft_ready"],
      scopeId,
    );
    const draftReplyCandidates = this.deps.store.fetchNextByStatus(
      "draft_reply",
      ["pending", "draft_creating", "draft_ready"],
      scopeId,
    );

    const candidates = [...sendReplyCandidates, ...draftReplyCandidates];
    candidates.sort((a, b) => {
      const aTime = new Date(a.command.created_at).getTime();
      const bTime = new Date(b.command.created_at).getTime();
      return aTime - bTime;
    });

    if (candidates.length === 0) {
      return { processed: false };
    }

    const { command, version } = candidates[0]!;

    if (command.status === "draft_ready" && !isVersionEligible(version, command)) {
      this.deps.logger?.warn("Skipping ineligible command", {
        outboundId: command.outbound_id,
        status: command.status,
        version: version.version,
      });
      return { processed: false };
    }

    await this.processCommand(command, version);
    return { processed: true, outboundId: command.outbound_id };
  }

  private async processCommand(
    command: OutboundCommand,
    version: OutboundVersion,
  ): Promise<void> {
    const { logger } = this.deps;

    try {
      switch (command.status) {
        case "pending":
        case "draft_creating": {
          await this.ensureDraftCreated(command, version);
          // If draft creation succeeded, continue to send/confirm in the same invocation
          const updated = this.deps.store.getCommand(command.outbound_id);
          if (updated && updated.status === "draft_ready") {
            if (updated.action_type === "draft_reply") {
              await this.confirmDraft(updated, version);
            } else {
              await this.sendDraft(updated, version);
            }
          }
          break;
        }
        case "draft_ready": {
          if (command.action_type === "draft_reply") {
            await this.confirmDraft(command, version);
          } else {
            await this.sendDraft(command, version);
          }
          break;
        }
        default: {
          logger?.warn("Unexpected status in send-reply worker", {
            outboundId: command.outbound_id,
            status: command.status,
          });
        }
      }
    } catch (error) {
      logger?.error("Unhandled error processing command", error as Error, {
        outboundId: command.outbound_id,
      });
      // Last resort: transition to failed_terminal from current stored status
      const current = this.deps.store.getCommand(command.outbound_id);
      if (current) {
        this.transition(current.outbound_id, current.status, "failed_terminal", {
          terminal_reason: `Unhandled error: ${(error as Error).message}`,
        });
      }
    }
  }

  private async createAndPersistDraft(
    command: OutboundCommand,
    version: OutboundVersion,
  ): Promise<void> {
    const { store, logger } = this.deps;
    try {
      const userId = this.deps.resolveUserId(command.scope_id);
      const payload = buildDraftPayload(command.outbound_id, version);
      const created = await this.deps.draftClient.createDraft(userId, payload);

      const now = new Date().toISOString();
      const managed: ManagedDraft = {
        outbound_id: command.outbound_id,
        version: version.version,
        draft_id: created.id,
        etag: null,
        internet_message_id: null,
        header_outbound_id_present: true,
        body_hash: computeBodyHash(version),
        recipients_hash: computeRecipientsHash(version),
        subject_hash: computeSubjectHash(version),
        created_at: now,
        last_verified_at: null,
        invalidated_reason: null,
      };
      store.setManagedDraft(managed);
    } catch (error) {
      logger?.warn("Draft creation failed", {
        outboundId: command.outbound_id,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  private async ensureDraftCreated(
    command: OutboundCommand,
    version: OutboundVersion,
  ): Promise<void> {
    const { store } = this.deps;

    // If currently pending, transition to draft_creating
    if (command.status === "pending") {
      this.transition(command.outbound_id, "pending", "draft_creating");
      command = { ...command, status: "draft_creating" };
    }

    // Check if we already have a managed draft from a prior attempt
    let managed = store.getManagedDraft(command.outbound_id, version.version);
    if (managed) {
      try {
        const verified = await this.verifyManagedDraft(managed, version, command.scope_id);
        if (verified) {
          this.transition(command.outbound_id, "draft_creating", "draft_ready");
          return;
        }
        // verifyManagedDraft will have transitioned to failed_terminal if invalid
        return;
      } catch (error) {
        if (isAuthError(error)) {
          this.transition(command.outbound_id, "draft_creating", "failed_terminal", {
            terminal_reason: `Auth error verifying draft: ${(error as Error).message}`,
          });
          return;
        }
        // Retryable error during verification
        this.transition(command.outbound_id, "draft_creating", "retry_wait", {
          terminal_reason: `Draft verification failed: ${(error as Error).message}`,
        });
        return;
      }
    }

    // No managed draft yet: create one
    try {
      await this.createAndPersistDraft(command, version);
      this.transition(command.outbound_id, "draft_creating", "draft_ready");
    } catch (error) {
      if (isAuthError(error)) {
        this.transition(command.outbound_id, "draft_creating", "failed_terminal", {
          terminal_reason: `Auth error creating draft: ${(error as Error).message}`,
        });
      } else if (isRetryableError(error)) {
        this.transition(command.outbound_id, "draft_creating", "retry_wait", {
          terminal_reason: `Draft creation failed: ${(error as Error).message}`,
        });
      } else {
        this.transition(command.outbound_id, "draft_creating", "failed_terminal", {
          terminal_reason: `Draft creation failed: ${(error as Error).message}`,
        });
      }
    }
  }

  private async sendDraft(
    command: OutboundCommand,
    version: OutboundVersion,
  ): Promise<void> {
    const { store, participantResolver, logger } = this.deps;

    // Re-verify managed draft before send
    let managed = store.getManagedDraft(command.outbound_id, version.version);
    if (!managed) {
      // Draft was lost locally but command is draft_ready. Recreate without state change.
      logger?.info("Managed draft missing, recreating", {
        outboundId: command.outbound_id,
        version: version.version,
      });
      try {
        await this.createAndPersistDraft(command, version);
      } catch (error) {
        logger?.warn("Failed to recreate missing managed draft", {
          outboundId: command.outbound_id,
          error: (error as Error).message,
        });
        if (isAuthError(error)) {
          this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
            terminal_reason: `Auth error recreating draft: ${(error as Error).message}`,
          });
        } else if (isRetryableError(error)) {
          this.transition(command.outbound_id, "draft_ready", "retry_wait", {
            terminal_reason: `Draft recreation failed: ${(error as Error).message}`,
          });
        } else {
          this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
            terminal_reason: `Draft recreation failed: ${(error as Error).message}`,
          });
        }
        return;
      }
      managed = store.getManagedDraft(command.outbound_id, version.version);
      if (!managed) {
        this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
          terminal_reason: "Managed draft still missing after recreation attempt",
        });
        return;
      }
    }

    try {
      const verified = await this.verifyManagedDraft(managed, version, command.scope_id);
      if (!verified) {
        // verifyManagedDraft handles its own transitions on failure
        return;
      }
    } catch (error) {
      if (isAuthError(error)) {
        this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
          terminal_reason: `Auth error verifying draft before send: ${(error as Error).message}`,
        });
      } else if (isRetryableError(error)) {
        this.transition(command.outbound_id, "draft_ready", "retry_wait", {
          terminal_reason: `Pre-send verification failed: ${(error as Error).message}`,
        });
      } else {
        this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
          terminal_reason: `Pre-send verification failed: ${(error as Error).message}`,
        });
      }
      return;
    }

    // Policy gate
    try {
      const participants = await participantResolver.getParticipants(
        command.scope_id,
        command.context_id,
      );
      const allRecipients = new Set([...version.to, ...version.cc, ...version.bcc]);
      for (const recipient of allRecipients) {
        if (!participants.has(recipient.toLowerCase())) {
          this.transition(command.outbound_id, "draft_ready", "blocked_policy", {
            blocked_reason: `Recipient ${recipient} is not a thread participant`,
          });
          return;
        }
      }
    } catch (error) {
      logger?.warn("Policy check failed", {
        outboundId: command.outbound_id,
        error: (error as Error).message,
      });
      this.transition(command.outbound_id, "draft_ready", "retry_wait", {
        terminal_reason: `Policy resolution error: ${(error as Error).message}`,
      });
      return;
    }

    // Transition to sending
    this.transition(command.outbound_id, "draft_ready", "sending");

    // Send the draft
    try {
      const userId = this.deps.resolveUserId(command.scope_id);
      await this.deps.draftClient.sendDraft(userId, managed.draft_id);
    } catch (error) {
      logger?.warn("Send draft failed", {
        outboundId: command.outbound_id,
        error: (error as Error).message,
      });
      if (isAuthError(error)) {
        this.transition(command.outbound_id, "sending", "failed_terminal", {
          terminal_reason: `Auth error sending draft: ${(error as Error).message}`,
        });
      } else if (isRetryableError(error)) {
        // After a send failure, we can go back to draft_ready to retry later
        this.transition(command.outbound_id, "sending", "retry_wait", {
          terminal_reason: `Send failed: ${(error as Error).message}`,
        });
      } else {
        this.transition(command.outbound_id, "sending", "failed_terminal", {
          terminal_reason: `Send failed: ${(error as Error).message}`,
        });
      }
      return;
    }

    // Send succeeded. Record submitted.
    // This must be done immediately; if it fails, the command stays in sending
    // and will be handled by reconciliation on the next pass.
    try {
      this.transition(command.outbound_id, "sending", "submitted", {
        submitted_at: new Date().toISOString(),
      });
    } catch (error) {
      logger?.error("Failed to record submitted state after successful send", error as Error, {
        outboundId: command.outbound_id,
      });
      // Intentionally leave in sending so reconciler can pick it up
      return;
    }
  }

  private async confirmDraft(
    command: OutboundCommand,
    version: OutboundVersion,
  ): Promise<void> {
    const { store, logger } = this.deps;

    let managed = store.getManagedDraft(command.outbound_id, version.version);
    if (!managed) {
      logger?.info("Managed draft missing, recreating for draft_reply", {
        outboundId: command.outbound_id,
        version: version.version,
      });
      try {
        await this.createAndPersistDraft(command, version);
      } catch (error) {
        logger?.warn("Failed to recreate missing managed draft", {
          outboundId: command.outbound_id,
          error: (error as Error).message,
        });
        if (isAuthError(error)) {
          this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
            terminal_reason: `Auth error recreating draft: ${(error as Error).message}`,
          });
        } else if (isRetryableError(error)) {
          this.transition(command.outbound_id, "draft_ready", "retry_wait", {
            terminal_reason: `Draft recreation failed: ${(error as Error).message}`,
          });
        } else {
          this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
            terminal_reason: `Draft recreation failed: ${(error as Error).message}`,
          });
        }
        return;
      }
      managed = store.getManagedDraft(command.outbound_id, version.version);
      if (!managed) {
        this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
          terminal_reason: "Managed draft still missing after recreation attempt",
        });
        return;
      }
    }

    try {
      const verified = await this.verifyManagedDraft(managed, version, command.scope_id);
      if (!verified) {
        return;
      }
    } catch (error) {
      if (isAuthError(error)) {
        this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
          terminal_reason: `Auth error verifying draft before confirm: ${(error as Error).message}`,
        });
      } else if (isRetryableError(error)) {
        this.transition(command.outbound_id, "draft_ready", "retry_wait", {
          terminal_reason: `Pre-confirm verification failed: ${(error as Error).message}`,
        });
      } else {
        this.transition(command.outbound_id, "draft_ready", "failed_terminal", {
          terminal_reason: `Pre-confirm verification failed: ${(error as Error).message}`,
        });
      }
      return;
    }

    this.transition(command.outbound_id, "draft_ready", "confirmed", {
      confirmed_at: new Date().toISOString(),
    });
  }

  /**
   * Verify that a managed draft still matches the expected version state.
   * Returns true if valid, false if invalid (and transitions to failed_terminal).
   * Throws on retryable Graph errors.
   */
  private async verifyManagedDraft(
    managed: ManagedDraft,
    version: OutboundVersion,
    mailboxId: string,
  ): Promise<boolean> {
    const { store, draftClient, logger } = this.deps;
    const userId = this.deps.resolveUserId(mailboxId);

    let remote;
    try {
      remote = await draftClient.getDraft(userId, managed.draft_id);
    } catch (error) {
      if (error instanceof ExchangeFSSyncError && error.code === ErrorCode.GRAPH_NOT_FOUND) {
        // Draft no longer exists on remote. Invalidate locally.
        store.setManagedDraft({
          ...managed,
          last_verified_at: new Date().toISOString(),
          invalidated_reason: "Draft not found on remote",
        });
        return false;
      }
      throw error;
    }

    const header = remote.internetMessageHeaders?.find(
      (h) => h.name.toLowerCase() === "x-outbound-id",
    );
    if (!header || header.value !== version.outbound_id) {
      logger?.error("Managed draft missing outbound_id header", undefined, {
        outboundId: version.outbound_id,
        draftId: managed.draft_id,
      });
      this.transition(version.outbound_id, "draft_creating", "failed_terminal", {
        terminal_reason: "External modification detected: outbound_id header missing or changed",
      });
      return false;
    }

    const expectedBodyContent = version.body_html || version.body_text;
    const expectedBodyHash = sha256(expectedBodyContent);
    const expectedRecipientsHash = computeRecipientsHash(version);
    const expectedSubjectHash = computeSubjectHash(version);

    const remoteBody = remote.body?.content ?? "";
    const remoteBodyHash = sha256(remoteBody);
    // Note: Graph may normalize whitespace or line endings. For v1 we do strict comparison.
    // If this proves too brittle, we can normalize before hashing.
    const remoteRecipients = {
      to: remote.toRecipients?.map((r) => r.emailAddress.address) ?? [],
      cc: remote.ccRecipients?.map((r) => r.emailAddress.address) ?? [],
      bcc: remote.bccRecipients?.map((r) => r.emailAddress.address) ?? [],
    };
    const remoteRecipientsHash = sha256(JSON.stringify(remoteRecipients));
    const remoteSubjectHash = sha256(remote.subject ?? "");

    if (
      expectedBodyHash !== remoteBodyHash ||
      expectedRecipientsHash !== remoteRecipientsHash ||
      expectedSubjectHash !== remoteSubjectHash
    ) {
      logger?.error("Managed draft content mismatch", undefined, {
        outboundId: version.outbound_id,
        draftId: managed.draft_id,
        expected: { bodyHash: expectedBodyHash, recipientsHash: expectedRecipientsHash, subjectHash: expectedSubjectHash },
        actual: { remoteBodyHash, remoteRecipientsHash, remoteSubjectHash },
      });
      this.transition(version.outbound_id, "draft_creating", "failed_terminal", {
        terminal_reason: "External modification detected: draft content mismatch",
      });
      return false;
    }

    store.setManagedDraft({
      ...managed,
      last_verified_at: new Date().toISOString(),
    });

    return true;
  }

  private transition(
    outboundId: string,
    from: OutboundStatus,
    to: OutboundStatus,
    updates?: Partial<
      Pick<
        OutboundCommand,
        "latest_version" | "blocked_reason" | "terminal_reason" | "submitted_at" | "confirmed_at"
      >
    >,
  ): void {
    if (!isValidTransition(from, to)) {
      throw new Error(`Invalid transition: ${from} -> ${to} for ${outboundId}`);
    }
    this.deps.store.updateCommandStatus(outboundId, to, updates);
    this.deps.store.appendTransition({
      outbound_id: outboundId,
      version: null,
      from_status: from,
      to_status: to,
      reason: updates?.terminal_reason ?? updates?.blocked_reason ?? null,
      transition_at: new Date().toISOString(),
    });
  }
}
