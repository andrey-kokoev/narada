/**
 * Bounded Graph Draft/Send Adapter
 *
 * Task 360 — Effect-execution adapter for the first allowed effect path:
 * `send_reply` via Microsoft Graph draft creation followed by send.
 *
 * This adapter is purely mechanical. It receives an already-authorized
 * command payload and attempts the external mutation. It does NOT:
 *
 * - Decide whether a command is eligible for execution
 * - Transition outbound command lifecycle state
 * - Confirm effects (confirmation is exclusively the reconciliation adapter's job)
 * - Fabricate success when Graph does not respond
 *
 * The caller (effect worker) is responsible for eligibility checks,
 * `execution_attempt` audit logging, and outbound status transitions.
 *
 * Uses bounded language per the effect-execution authority contract:
 * "draft submitted to Graph; confirmation requires observation"
 */

// ---------------------------------------------------------------------------
// Payload and result shapes
// ---------------------------------------------------------------------------

export interface SendReplyPayload {
  /** Graph message ID of the parent message being replied to. */
  parentMessageId: string;
  /** Plain-text body of the reply. */
  replyBody: string;
  /** Optional subject prefix; adapter may prepend "Re: " if absent. */
  replySubject?: string;
}

export interface GraphDraftSendResult {
  /** Mechanical outcome — NOT confirmation. */
  status: "submitted" | "failed_retryable" | "failed_terminal";
  /** Correlates this result back to the originating outbound command. */
  outboundId: string;
  /** Graph draft ID if draft creation succeeded. */
  draftId?: string;
  /** Graph message ID of the sent message if send succeeded. */
  sentMessageId?: string;
  /** Internet message ID for downstream reconciliation matching. */
  internetMessageId?: string;
  /** ISO timestamp of the attempt (not confirmation). */
  submittedAt?: string;
  /** HTTP status or Graph error code. */
  errorCode?: string;
  /** Human-readable error detail. */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Mockable Graph client boundary
// ---------------------------------------------------------------------------

export interface GraphDraftClient {
  /**
   * Create a draft reply message.
   *
   * The implementation MAY inject the `outboundId` as a custom header or
   * extended property so the reconciliation adapter can correlate later.
   * Header injection is Graph-API-specific and is not required for the
   * bounded adapter contract to hold.
   */
  createDraftReply(
    scopeId: string,
    outboundId: string,
    parentMessageId: string,
    body: string,
    subject?: string,
  ): Promise<{ draftId: string; internetMessageId?: string }>;

  /** Send an existing draft message. */
  sendDraft(
    scopeId: string,
    draftId: string,
  ): Promise<{ sentMessageId: string; internetMessageId?: string }>;
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GraphDraftSendAdapter {
  constructor(
    private readonly client: GraphDraftClient,
    private readonly retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
  ) {}

  /**
   * Attempt a `send_reply` effect through Graph draft creation + send.
   *
   * The adapter performs a bounded retry loop for transient failures
   * (rate limit, service unavailable, network timeout). Permanent
   * failures fail fast with no retry.
   *
   * Returns as soon as one stage definitively succeeds or fails.
   * A successful return means Graph accepted the send request — NOT
   * that the message was delivered, is in Sent Items, or is correct.
   * Confirmation requires independent reconciliation observation.
   *
   * Residual: retryable send failures restart from draft creation,
   * which may leave orphaned drafts in Graph. A production refinement
   * would retry only the send stage for already-created drafts.
   */
  async executeSendReply(
    scopeId: string,
    outboundId: string,
    payload: SendReplyPayload,
  ): Promise<GraphDraftSendResult> {
    const startedAt = new Date().toISOString();

    let lastError: GraphDraftSendResult | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        // Stage 1: create draft
        const draft = await this.client.createDraftReply(
          scopeId,
          outboundId,
          payload.parentMessageId,
          payload.replyBody,
          payload.replySubject,
        );

        // Stage 2: send draft
        const sent = await this.client.sendDraft(scopeId, draft.draftId);

        return {
          status: "submitted",
          outboundId,
          draftId: draft.draftId,
          sentMessageId: sent.sentMessageId,
          internetMessageId:
            sent.internetMessageId ?? draft.internetMessageId,
          submittedAt: startedAt,
        };
      } catch (error) {
        lastError = { ...this.classifyError(error), outboundId };

        if (lastError.status === "failed_terminal") {
          // Permanent failures are not retried
          return lastError;
        }

        if (attempt < this.retryConfig.maxAttempts) {
          const delay = Math.min(
            this.retryConfig.baseDelayMs * 2 ** (attempt - 1),
            this.retryConfig.maxDelayMs,
          );
          await this.sleep(delay);
        }
      }
    }

    // Exhausted retries
    const exhausted: GraphDraftSendResult = {
      status: "failed_retryable",
      outboundId,
      errorCode: "RETRY_EXHAUSTED",
      errorMessage: "All retry attempts exhausted without definitive result",
    };
    return lastError ? { ...lastError, outboundId } : exhausted;
  }

  private classifyError(error: unknown): Omit<GraphDraftSendResult, "outboundId"> {
    const err = error as {
      status?: number;
      code?: string;
      message?: string;
    };

    const status = err.status;
    const code = err.code ?? "UNKNOWN";
    const message = err.message ?? String(error);

    // Terminal failures — no automatic retry
    if (status === 401 || code === "AuthenticationError") {
      return {
        status: "failed_terminal",
        errorCode: "401",
        errorMessage: message,
      };
    }
    if (status === 403 || code === "AccessDenied") {
      return {
        status: "failed_terminal",
        errorCode: "403",
        errorMessage: message,
      };
    }
    if (
      status === 400 ||
      code === "ErrorInvalidId" ||
      code === "ErrorInvalidRequest"
    ) {
      return {
        status: "failed_terminal",
        errorCode: "400",
        errorMessage: message,
      };
    }
    if (status === 404 || code === "ErrorItemNotFound") {
      return {
        status: "failed_terminal",
        errorCode: "404",
        errorMessage: message,
      };
    }
    if (status === 413) {
      return {
        status: "failed_terminal",
        errorCode: "413",
        errorMessage: message,
      };
    }

    // Retryable failures
    if (status === 429 || code === "ErrorRateLimitExceeded") {
      return {
        status: "failed_retryable",
        errorCode: "429",
        errorMessage: message,
      };
    }
    if (status === 503) {
      return {
        status: "failed_retryable",
        errorCode: "503",
        errorMessage: message,
      };
    }
    if (status === 504) {
      return {
        status: "failed_retryable",
        errorCode: "504",
        errorMessage: message,
      };
    }

    // Network-level errors default to retryable
    if (
      status === undefined ||
      code === "NetworkError" ||
      code === "TimeoutError"
    ) {
      return {
        status: "failed_retryable",
        errorCode: code ?? "NETWORK",
        errorMessage: message,
      };
    }

    // Unknown structured errors default to terminal to avoid infinite retry
    return {
      status: "failed_terminal",
      errorCode: code,
      errorMessage: message,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
