import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GraphDraftSendAdapter,
  type GraphDraftClient,
  type SendReplyPayload,
  type RetryConfig,
} from "../../src/effects/graph-draft-send-adapter.js";

function buildMockClient(
  overrides: Partial<GraphDraftClient> = {},
): GraphDraftClient {
  return {
    createDraftReply: vi.fn(async () => ({
      draftId: "draft-001",
      internetMessageId: "<draft-imid@example.com>",
    })),
    sendDraft: vi.fn(async () => ({
      sentMessageId: "sent-001",
      internetMessageId: "<sent-imid@example.com>",
    })),
    ...overrides,
  };
}

const samplePayload: SendReplyPayload = {
  parentMessageId: "parent-msg-1",
  replyBody: "This is the reply body.",
  replySubject: "Re: Original Subject",
};

const fastRetry: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 10,
  maxDelayMs: 50,
};

describe("GraphDraftSendAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls createDraftReply then sendDraft for an authorized attempt", async () => {
    const client = buildMockClient();
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(client.createDraftReply).toHaveBeenCalledWith(
      "scope-1",
      "ob-1",
      "parent-msg-1",
      "This is the reply body.",
      "Re: Original Subject",
    );
    expect(client.sendDraft).toHaveBeenCalledWith("scope-1", "draft-001");
    expect(result.status).toBe("submitted");
  });

  it("returns external identities for persistence", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => ({
        draftId: "draft-abc",
        internetMessageId: "<draft-abc@graph.microsoft.com>",
      })),
      sendDraft: vi.fn(async () => ({
        sentMessageId: "msg-sent-xyz",
        internetMessageId: "<sent-xyz@graph.microsoft.com>",
      })),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(result.status).toBe("submitted");
    expect(result.draftId).toBe("draft-abc");
    expect(result.sentMessageId).toBe("msg-sent-xyz");
    expect(result.internetMessageId).toBe("<sent-xyz@graph.microsoft.com>");
    expect(result.submittedAt).toMatch(/^\d{4}-/);
  });

  it("carries forward draft internetMessageId when send does not return one", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => ({
        draftId: "draft-001",
        internetMessageId: "<only-from-draft@example.com>",
      })),
      sendDraft: vi.fn(async () => ({
        sentMessageId: "sent-001",
        // no internetMessageId
      })),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(result.internetMessageId).toBe("<only-from-draft@example.com>");
  });

  it("classifies 401 as terminal with no retry", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 401, code: "AuthenticationError", message: "Bad creds" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(result.status).toBe("failed_terminal");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("401");
    expect(client.createDraftReply).toHaveBeenCalledTimes(1);
  });

  it("classifies 400 as terminal with no retry", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 400, code: "ErrorInvalidRequest", message: "Bad payload" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(result.status).toBe("failed_terminal");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("400");
    expect(client.createDraftReply).toHaveBeenCalledTimes(1);
  });

  it("classifies 403 as terminal", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 403, code: "AccessDenied", message: "No permission" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(result.status).toBe("failed_terminal");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("403");
  });

  it("classifies 404 as terminal", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 404, code: "ErrorItemNotFound", message: "Gone" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(result.status).toBe("failed_terminal");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("404");
  });

  it("classifies 413 as terminal", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 413, message: "Payload too large" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(result.status).toBe("failed_terminal");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("413");
  });

  it("retries on 429 rate limit and eventually succeeds", async () => {
    let calls = 0;
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        calls++;
        if (calls < 3) {
          throw { status: 429, code: "ErrorRateLimitExceeded", message: "Slow down" };
        }
        return { draftId: "draft-retry", internetMessageId: "<retry@example.com>" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const promise = adapter.executeSendReply("scope-1", "ob-1", samplePayload);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("submitted");
    expect(result.draftId).toBe("draft-retry");
    expect(client.createDraftReply).toHaveBeenCalledTimes(3);
  });

  it("retries on 503 and eventually succeeds", async () => {
    let calls = 0;
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        calls++;
        if (calls < 2) {
          throw { status: 503, message: "Unavailable" };
        }
        return { draftId: "draft-ok" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const promise = adapter.executeSendReply("scope-1", "ob-1", samplePayload);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("submitted");
    expect(client.createDraftReply).toHaveBeenCalledTimes(2);
  });

  it("returns failed_retryable when all retry attempts are exhausted", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 504, message: "Gateway timeout" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const promise = adapter.executeSendReply("scope-1", "ob-1", samplePayload);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("failed_retryable");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("504");
    expect(client.createDraftReply).toHaveBeenCalledTimes(3);
  });

  it("classifies network timeout as retryable", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { code: "TimeoutError", message: "Request timed out" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const promise = adapter.executeSendReply("scope-1", "ob-1", samplePayload);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("failed_retryable");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("TimeoutError");
  });

  it("classifies unknown structured error as terminal", async () => {
    const client = buildMockClient({
      createDraftReply: vi.fn(async () => {
        throw { status: 418, code: "ImATeapot", message: "Unexpected" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    expect(result.status).toBe("failed_terminal");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("ImATeapot");
  });

  it("cannot be used as an authority decision source", () => {
    const client = buildMockClient();
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    // The adapter has no method to check authorization, eligibility, or
    // command status. It is purely a mechanical execution boundary.
    expect("checkAuthorization" in adapter).toBe(false);
    expect("isCommandApproved" in adapter).toBe(false);
    expect("canExecute" in adapter).toBe(false);
  });

  it("does not fabricate confirmation on adapter success", async () => {
    const client = buildMockClient();
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply(
      "scope-1",
      "ob-1",
      samplePayload,
    );

    // Result status is "submitted" (Graph accepted the send request),
    // NOT "confirmed". Confirmation is reconciliation's exclusive job.
    expect(result.status).toBe("submitted");
    expect(result).not.toHaveProperty("confirmedAt");
    expect(result).not.toHaveProperty("confirmed");
  });

  it("fails send stage when draft creation succeeded but send throws", async () => {
    const client = buildMockClient({
      sendDraft: vi.fn(async () => {
        throw { status: 503, message: "Send failed" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const promise = adapter.executeSendReply("scope-1", "ob-1", samplePayload);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("failed_retryable");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("503");
    // draftId is NOT returned because send did not succeed.
    // The adapter could return it as a residual, but for bounded
    // simplicity we only return IDs when the full flow succeeds.
    expect(result.draftId).toBeUndefined();
  });

  it("classifies terminal error at send stage with no retry", async () => {
    const client = buildMockClient({
      sendDraft: vi.fn(async () => {
        throw { status: 400, code: "ErrorInvalidRequest", message: "Invalid draft state" };
      }),
    });
    const adapter = new GraphDraftSendAdapter(client, fastRetry);

    const result = await adapter.executeSendReply("scope-1", "ob-1", samplePayload);

    expect(result.status).toBe("failed_terminal");
    expect(result.outboundId).toBe("ob-1");
    expect(result.errorCode).toBe("400");
    // createDraftReply is called once; sendDraft throws once;
    // terminal failure means no retry.
    expect(client.createDraftReply).toHaveBeenCalledTimes(1);
    expect(client.sendDraft).toHaveBeenCalledTimes(1);
  });
});
