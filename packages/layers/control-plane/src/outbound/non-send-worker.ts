/**
 * Non-Send Outbound Worker
 *
 * Durable worker for mark_read, move_message, and set_categories.
 * Executes the action via Graph API and transitions to submitted.
 */

import type { Logger } from "../logging/types.js";
import type { OutboundStore } from "./store.js";
import type { OutboundCommand, OutboundVersion } from "./types.js";
import { isVersionEligible, isValidTransition } from "./types.js";
import { ExchangeFSSyncError, ErrorCode } from "../errors.js";

export interface NonSendGraphClient {
  patchMessage(userId: string, messageId: string, body: object): Promise<void>;
  moveMessage(userId: string, messageId: string, destinationId: string): Promise<void>;
}

export interface NonSendWorkerDeps {
  store: OutboundStore;
  graphClient: NonSendGraphClient;
  resolveUserId: (mailboxId: string) => string;
  logger?: Logger;
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

export class NonSendWorker {
  constructor(private readonly deps: NonSendWorkerDeps) {}

  /**
   * Process the next eligible non-send command of the given action type.
   */
  async processNext(
    actionType: "mark_read" | "move_message" | "set_categories",
    scopeId?: string,
  ): Promise<{ processed: boolean; outboundId?: string }> {
    const candidates = this.deps.store.fetchNextByStatus(
      actionType,
      ["pending", "draft_ready"],
      scopeId,
    );

    if (candidates.length === 0) {
      return { processed: false };
    }

    const { command, version } = candidates[0]!;

    if (command.status === "draft_ready" && !isVersionEligible(version, command)) {
      this.deps.logger?.warn("Skipping ineligible non-send command", {
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

    const payload = parsePayload(version);
    if (!payload.target_message_id) {
      logger?.error("Missing target_message_id in non-send payload", undefined, {
        outboundId: command.outbound_id,
      });
      this.transition(command.outbound_id, command.status, "failed_terminal", command.action_type, {
        terminal_reason: "Missing target_message_id in payload",
      });
      return;
    }

    // Non-send actions transition pending -> draft_ready -> sending -> submitted
    // in a single invocation for simplicity.
    if (command.status === "pending") {
      this.transition(command.outbound_id, "pending", "draft_ready", command.action_type);
      command = { ...command, status: "draft_ready" };
    }

    this.transition(command.outbound_id, "draft_ready", "sending", command.action_type);

    try {
      const userId = this.deps.resolveUserId(command.scope_id);
      await this.executeAction(userId, payload, command.action_type);
    } catch (error) {
      logger?.warn("Non-send action execution failed", {
        outboundId: command.outbound_id,
        actionType: command.action_type,
        error: (error as Error).message,
      });
      if (isAuthError(error)) {
        this.transition(command.outbound_id, "sending", "failed_terminal", command.action_type, {
          terminal_reason: `Auth error executing ${command.action_type}: ${(error as Error).message}`,
        });
      } else if (isRetryableError(error)) {
        this.transition(command.outbound_id, "sending", "retry_wait", command.action_type, {
          terminal_reason: `${command.action_type} failed: ${(error as Error).message}`,
        });
      } else {
        this.transition(command.outbound_id, "sending", "failed_terminal", command.action_type, {
          terminal_reason: `${command.action_type} failed: ${(error as Error).message}`,
        });
      }
      return;
    }

    // Record submitted
    try {
      this.transition(command.outbound_id, "sending", "submitted", command.action_type, {
        submitted_at: new Date().toISOString(),
      });
    } catch (error) {
      logger?.error(
        "Failed to record submitted state after successful non-send action",
        error as Error,
        { outboundId: command.outbound_id },
      );
      // Leave in sending for reconciler
    }
  }

  private async executeAction(
    userId: string,
    payload: ActionPayload,
    actionType: OutboundCommand["action_type"],
  ): Promise<void> {
    const targetId = payload.target_message_id!;

    if (actionType === "mark_read") {
      await this.deps.graphClient.patchMessage(userId, targetId, { isRead: true });
    } else if (actionType === "set_categories") {
      await this.deps.graphClient.patchMessage(userId, targetId, {
        categories: payload.categories ?? [],
      });
    } else if (actionType === "move_message") {
      if (!payload.destination_folder_id) {
        throw new Error("Missing destination_folder_id for move_message");
      }
      await this.deps.graphClient.moveMessage(
        userId,
        targetId,
        payload.destination_folder_id,
      );
    } else {
      throw new Error(`Unsupported non-send action: ${actionType}`);
    }
  }

  private transition(
    outboundId: string,
    from: import("./types.js").OutboundStatus,
    to: import("./types.js").OutboundStatus,
    actionType: import("./types.js").OutboundCommand["action_type"],
    updates?: Partial<
      Pick<
        OutboundCommand,
        "latest_version" | "blocked_reason" | "terminal_reason" | "submitted_at" | "confirmed_at"
      >
    >,
  ): void {
    if (!isValidTransition(from, to, actionType)) {
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
