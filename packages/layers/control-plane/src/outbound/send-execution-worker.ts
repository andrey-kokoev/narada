import { createHash } from "node:crypto";

/**
 * Send Execution Worker
 *
 * Dedicated outbound worker that performs the actual Graph send for
 * commands that have been explicitly approved via the operator action surface.
 *
 * Authority boundary:
 * - Processes commands in "approved_for_send" or "retry_wait" status
 * - Verifies managed draft integrity before send
 * - Enforces participant policy gate
 * - Records durable transitions for execution start, retryable failure,
 *   terminal failure, and submitted
 * - Never sends directly from charter output or mere draft existence
 */

import type { Logger } from "../logging/types.js";
import type { OutboundStore } from "./store.js";
import type {
  OutboundCommand,
  OutboundStatus,
  OutboundVersion,
  ManagedDraft,
} from "./types.js";
import { isVersionEligible, isValidTransition } from "./types.js";
import type { GraphDraftClient } from "./graph-draft-client.js";
import { ExchangeFSSyncError, ErrorCode } from "../errors.js";

export interface ParticipantResolver {
  getParticipants(mailboxId: string, threadId: string): Promise<Set<string>>;
}

export interface SendExecutionWorkerDeps {
  store: OutboundStore;
  draftClient: GraphDraftClient;
  participantResolver: ParticipantResolver;
  resolveUserId: (mailboxId: string) => string;
  logger?: Logger;
}

export class SendExecutionWorker {
  constructor(private readonly deps: SendExecutionWorkerDeps) {}

  /**
   * Process the next approved-for-send or retry-wait send command.
   * Returns whether a command was processed.
   */
  private readonly RETRY_WAIT_COOLDOWN_MS = 30_000;

  async processNext(scopeId?: string): Promise<{ processed: boolean; outboundId?: string }> {
    const sendReplyCandidates = this.deps.store.fetchNextByStatus(
      "send_reply",
      ["approved_for_send", "retry_wait"],
      scopeId,
    );
    const sendNewMessageCandidates = this.deps.store.fetchNextByStatus(
      "send_new_message",
      ["approved_for_send", "retry_wait"],
      scopeId,
    );

    const candidates = [...sendReplyCandidates, ...sendNewMessageCandidates];
    candidates.sort((a, b) => {
      const aTime = new Date(a.command.created_at).getTime();
      const bTime = new Date(b.command.created_at).getTime();
      return aTime - bTime;
    });

    if (candidates.length === 0) {
      return { processed: false };
    }

    let { command, version } = candidates[0]!;

    // Cooldown: retry_wait commands must sit for at least RETRY_WAIT_COOLDOWN_MS
    // before being retried, to avoid hammering Graph API on persistent errors.
    if (command.status === "retry_wait") {
      const latestRetryTransition = this.deps.store.getLatestNonCreationTransition(command.outbound_id, "retry_wait");
      if (latestRetryTransition) {
        const elapsedMs = Date.now() - new Date(latestRetryTransition.transition_at).getTime();
        if (elapsedMs < this.RETRY_WAIT_COOLDOWN_MS) {
          this.deps.logger?.info("Skipping retry_wait command inside cooldown", {
            outboundId: command.outbound_id,
            elapsedMs,
            cooldownMs: this.RETRY_WAIT_COOLDOWN_MS,
          });
          return { processed: false };
        }
      }
    }

    if (!isVersionEligible(version, command)) {
      this.deps.logger?.warn("Skipping ineligible send command", {
        outboundId: command.outbound_id,
        status: command.status,
        version: version.version,
      });
      return { processed: false };
    }

    // Explicit re-approval: a retry_wait command must pass through
    // approved_for_send before send, so the audit trail is honest.
    if (command.status === "retry_wait") {
      this.transition(command.outbound_id, "retry_wait", "approved_for_send");
      // Refresh command object so processCommand sees the updated status
      const refreshed = this.deps.store.getCommand(command.outbound_id);
      if (!refreshed) {
        this.deps.logger?.error("Command disappeared after re-approval transition", undefined, {
          outboundId: command.outbound_id,
        });
        return { processed: false };
      }
      command = refreshed;
    }

    await this.processCommand(command, version);
    return { processed: true, outboundId: command.outbound_id };
  }

  private async processCommand(
    command: OutboundCommand,
    version: OutboundVersion,
  ): Promise<void> {
    const { store, participantResolver, logger } = this.deps;

    // Re-verify managed draft before send.
    // Approval applies to an inspected draft; if the draft is missing, we
    // must NOT recreate it (that would bypass the review invariant).
    const managed = store.getManagedDraft(command.outbound_id, version.version);
    if (!managed) {
      logger?.error("Managed draft missing at send time — cannot recreate after approval", undefined, {
        outboundId: command.outbound_id,
        version: version.version,
      });
      this.transition(command.outbound_id, "approved_for_send", "failed_terminal", {
        terminal_reason: "Managed draft missing at send time — draft was never created or was lost after approval",
      });
      return;
    }

    try {
      const verified = await this.verifyManagedDraft(managed, version, command.scope_id);
      if (!verified) {
        // verifyManagedDraft handles its own transitions on failure
        return;
      }
    } catch (error) {
      if (isAuthError(error)) {
        this.transition(command.outbound_id, "approved_for_send", "failed_terminal", {
          terminal_reason: `Auth error verifying draft before send: ${(error as Error).message}`,
        });
      } else if (isRetryableError(error)) {
        this.transition(command.outbound_id, "approved_for_send", "retry_wait", {
          terminal_reason: `Pre-send verification failed: ${(error as Error).message}`,
        });
      } else {
        this.transition(command.outbound_id, "approved_for_send", "failed_terminal", {
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
          this.transition(command.outbound_id, "approved_for_send", "blocked_policy", {
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
      this.transition(command.outbound_id, "approved_for_send", "retry_wait", {
        terminal_reason: `Policy resolution error: ${(error as Error).message}`,
      });
      return;
    }

    // Transition to sending
    this.transition(command.outbound_id, "approved_for_send", "sending");

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
        // Draft no longer exists on remote. Invalidate locally and fail the
        // command so it does not remain stuck in approved_for_send.
        store.setManagedDraft({
          ...managed,
          last_verified_at: new Date().toISOString(),
          invalidated_reason: "Draft not found on remote",
        });
        this.transition(version.outbound_id, "approved_for_send", "failed_terminal", {
          terminal_reason: "Draft deleted remotely before send",
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
      this.transition(version.outbound_id, "approved_for_send", "failed_terminal", {
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
      this.transition(version.outbound_id, "approved_for_send", "failed_terminal", {
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
        "latest_version" | "blocked_reason" | "terminal_reason" | "submitted_at" | "confirmed_at" | "approved_at"
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

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function computeRecipientsHash(version: OutboundVersion): string {
  return sha256(JSON.stringify({ to: version.to, cc: version.cc, bcc: version.bcc }));
}

function computeSubjectHash(version: OutboundVersion): string {
  return sha256(version.subject);
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


