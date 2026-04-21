/**
 * Outbound Reconciler
 *
 * Binds submitted outbound commands to observed remote/local mailbox state.
 * Transitions submitted -> confirmed when evidence is found,
 * or to retry_wait when confirmation cannot be proven within the window.
 */

import type { Logger } from "../logging/types.js";
import type { OutboundStore } from "./store.js";
import type { OutboundCommand, OutboundVersion, OutboundStatus } from "./types.js";
import { isValidTransition } from "./types.js";

export interface FoundMessage {
  messageId: string;
  isRead?: boolean;
  folderRefs?: string[];
  categoryRefs?: string[];
  headers?: Record<string, string[]>;
}

export interface MessageFinder {
  findByOutboundId(mailboxId: string, outboundId: string): Promise<FoundMessage | undefined>;
  findByMessageId(mailboxId: string, messageId: string): Promise<FoundMessage | undefined>;
  findByInternetMessageId(mailboxId: string, internetMessageId: string): Promise<FoundMessage | undefined>;
}

export interface ReconcilerDeps {
  store: OutboundStore;
  messageFinder: MessageFinder;
  logger?: Logger;
  confirmWindowMs?: number;
}

interface ActionPayload {
  target_message_id?: string;
  destination_folder_id?: string;
  categories?: string[];
}

function parsePayload(version: OutboundVersion): ActionPayload {
  try {
    return JSON.parse(version.payload_json) as ActionPayload;
  } catch {
    return {};
  }
}

export class OutboundReconciler {
  private readonly confirmWindowMs: number;

  constructor(private readonly deps: ReconcilerDeps) {
    this.confirmWindowMs = deps.confirmWindowMs ?? 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Process the next submitted command awaiting confirmation.
   */
  async processNext(scopeId?: string): Promise<{ processed: boolean; outboundId?: string }> {
    const candidates = this.deps.store.fetchNextByStatus(
      "send_reply",
      ["submitted"],
      scopeId,
    );

    // Also scan non-send actions in submitted
    const nonSendActions: OutboundCommand["action_type"][] = [
      "mark_read",
      "move_message",
      "set_categories",
    ];
    for (const action of nonSendActions) {
      const more = this.deps.store.fetchNextByStatus(action, ["submitted"], scopeId);
      candidates.push(...more);
    }

    // Sort by submitted_at (oldest first) to process in order
    candidates.sort((a, b) => {
      const aTime = a.command.submitted_at ? new Date(a.command.submitted_at).getTime() : 0;
      const bTime = b.command.submitted_at ? new Date(b.command.submitted_at).getTime() : 0;
      return aTime - bTime;
    });

    if (candidates.length === 0) {
      return { processed: false };
    }

    const { command, version } = candidates[0]!;
    await this.reconcile(command, version);
    return { processed: true, outboundId: command.outbound_id };
  }

  /**
   * Reconcile a specific outbound command by ID.
   *
   * Returns the result of the reconciliation attempt without polling.
   * This is the targeted path used by confirmation replay.
   */
  async reconcileOne(outboundId: string): Promise<{
    previousStatus: OutboundStatus;
    newStatus: OutboundStatus;
    confirmed: boolean;
    evidence?: string;
  } | undefined> {
    const command = this.deps.store.getCommand(outboundId);
    if (!command) return undefined;
    const version = this.deps.store.getLatestVersion(outboundId);
    if (!version) return undefined;

    const previousStatus = command.status;
    if (previousStatus !== "submitted") {
      return {
        previousStatus,
        newStatus: previousStatus,
        confirmed: previousStatus === "confirmed",
      };
    }

    await this.reconcile(command, version);

    const updated = this.deps.store.getCommand(outboundId)!;
    return {
      previousStatus,
      newStatus: updated.status,
      confirmed: updated.status === "confirmed",
      evidence: updated.confirmed_at
        ? "Message found via observation/reconciliation"
        : updated.terminal_reason ?? undefined,
    };
  }

  private async reconcile(command: OutboundCommand, version: OutboundVersion): Promise<void> {
    const { messageFinder, logger } = this.deps;

    const submittedAt = command.submitted_at
      ? new Date(command.submitted_at).getTime()
      : Date.now();
    const now = Date.now();
    const elapsedMs = now - submittedAt;

    let confirmed = false;
    let evidence: string | null = null;

    try {
      if (command.action_type === "send_reply") {
        const managed = this.deps.store.getManagedDraft(command.outbound_id, version.version);
        if (managed?.internet_message_id) {
          const message = await messageFinder.findByInternetMessageId(
            command.scope_id,
            managed.internet_message_id,
          );
          if (message) {
            confirmed = true;
            evidence = `Found message ${message.messageId} matching internetMessageId`;
          }
        }
        // Fallback to header-based lookup for legacy drafts without internetMessageId
        if (!confirmed) {
          const message = await messageFinder.findByOutboundId(
            command.scope_id,
            command.outbound_id,
          );
          if (message) {
            confirmed = true;
            evidence = `Found message ${message.messageId} with outbound_id header`;
          }
        }
      } else {
        const payload = parsePayload(version);
        const targetMessageId = payload.target_message_id;
        if (!targetMessageId) {
          logger?.warn("Missing target_message_id in payload for non-send action", {
            outboundId: command.outbound_id,
            actionType: command.action_type,
          });
          this.transition(command.outbound_id, "submitted", "failed_terminal", {
            terminal_reason: "Missing target_message_id in payload",
          });
          return;
        }

        const message = await messageFinder.findByMessageId(
          command.scope_id,
          targetMessageId,
        );

        if (message) {
          if (command.action_type === "mark_read") {
            confirmed = message.isRead === true;
            evidence = confirmed ? "Message is_read=true" : "Message is_read=false";
          } else if (command.action_type === "move_message") {
            const dest = payload.destination_folder_id;
            if (!dest) {
              this.transition(command.outbound_id, "submitted", "failed_terminal", {
                terminal_reason: "Missing destination_folder_id in payload",
              });
              return;
            }
            confirmed = message.folderRefs?.includes(dest) ?? false;
            evidence = confirmed
              ? `Message found in folder ${dest}`
              : `Message not in folder ${dest}`;
          } else if (command.action_type === "set_categories") {
            const expected = new Set(payload.categories ?? []);
            const actual = new Set(message.categoryRefs ?? []);
            confirmed =
              expected.size > 0 && [...expected].every((c) => actual.has(c));
            evidence = confirmed
              ? `Categories ${[...expected].join(", ")} present`
              : `Expected categories ${[...expected].join(", ")} not found`;
          }
        }
      }
    } catch (error) {
      logger?.warn("Reconciliation lookup failed", {
        outboundId: command.outbound_id,
        error: (error as Error).message,
      });
      // Retryable lookup error: leave in submitted and try again later
      return;
    }

    if (confirmed) {
      this.transition(command.outbound_id, "submitted", "confirmed", {
        confirmed_at: new Date().toISOString(),
      });
      logger?.info("Reconciled command to confirmed", {
        outboundId: command.outbound_id,
        evidence,
      });
      return;
    }

    // Not confirmed yet. If window elapsed, transition to retry_wait for review.
    if (elapsedMs > this.confirmWindowMs) {
      this.transition(command.outbound_id, "submitted", "retry_wait", {
        terminal_reason: `Reconciliation window expired without confirmation: ${evidence ?? "no matching message found"}`,
      });
      logger?.warn("Reconciliation window expired", {
        outboundId: command.outbound_id,
        elapsedMs,
      });
    }
    // Else: leave in submitted and try again next poll
  }

  private transition(
    outboundId: string,
    from: import("./types.js").OutboundStatus,
    to: import("./types.js").OutboundStatus,
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
