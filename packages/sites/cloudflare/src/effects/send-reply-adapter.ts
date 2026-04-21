/**
 * Send-Reply Effect Execution Adapter Bridge (Task 361)
 *
 * Bridges the effect worker's `EffectExecutionAdapter` interface with the
 * `GraphDraftSendAdapter` from Task 360. This is the integration layer:
 * - Parses payload JSON into the adapter's expected shape
 * - Invokes Graph draft creation + send
 * - Maps the rich `GraphDraftSendResult` into the worker's result shape
 * - Serializes external identities into `responseJson` for audit
 *
 * The bridge is mechanical: it does not decide eligibility, approve commands,
 * transition lifecycle state, or confirm effects.
 */

import type { EffectExecutionAdapter } from "../effect-worker.js";
import {
  GraphDraftSendAdapter,
  type GraphDraftClient,
  type SendReplyPayload,
} from "./graph-draft-send-adapter.js";

export interface SendReplyAdapterOptions {
  client: GraphDraftClient;
  workerId?: string;
}

/**
 * Create an `EffectExecutionAdapter` that executes `send_reply` commands
 * through the Graph draft/send boundary.
 */
export function createSendReplyEffectAdapter(
  options: SendReplyAdapterOptions,
): EffectExecutionAdapter {
  const graphAdapter = new GraphDraftSendAdapter(options.client);

  return {
    async attemptEffect(command) {
      // Parse payload. If payload is missing or malformed, fail terminal
      // immediately — the worker should not retry a structurally bad command.
      let payload: SendReplyPayload;
      try {
        payload = parseSendReplyPayload(command.payloadJson);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: "failed_terminal",
          errorCode: "PAYLOAD_PARSE_ERROR",
          errorMessage: message,
          responseJson: JSON.stringify({
            outboundId: command.outboundId,
            error: "Invalid send_reply payload",
            detail: message,
          }),
        };
      }

      const result = await graphAdapter.executeSendReply(
        command.scopeId,
        command.outboundId,
        payload,
      );

      // Serialize the full Graph result into responseJson so the audit record
      // captures draftId, sentMessageId, internetMessageId, and submittedAt.
      const responseJson = JSON.stringify({
        outboundId: result.outboundId,
        draftId: result.draftId ?? null,
        sentMessageId: result.sentMessageId ?? null,
        internetMessageId: result.internetMessageId ?? null,
        submittedAt: result.submittedAt ?? null,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      });

      return {
        status: result.status,
        externalRef: result.sentMessageId ?? result.draftId ?? undefined,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        responseJson,
      };
    },
  };
}

function parseSendReplyPayload(payloadJson: string | null): SendReplyPayload {
  if (!payloadJson) {
    throw new Error("send_reply payload is null");
  }
  const parsed = JSON.parse(payloadJson) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("send_reply payload is not an object");
  }
  const p = parsed as Record<string, unknown>;
  const parentMessageId = p.parentMessageId ?? p.parent_message_id;
  const replyBody = p.replyBody ?? p.reply_body ?? p.body;
  if (typeof parentMessageId !== "string" || parentMessageId.length === 0) {
    throw new Error("send_reply payload missing parentMessageId");
  }
  if (typeof replyBody !== "string") {
    throw new Error("send_reply payload missing replyBody");
  }
  return {
    parentMessageId,
    replyBody,
    replySubject: typeof p.replySubject === "string" ? p.replySubject : undefined,
  };
}
