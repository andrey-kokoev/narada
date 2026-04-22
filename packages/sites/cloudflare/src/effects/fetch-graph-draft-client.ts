/**
 * Fetch-based Graph Draft Client
 *
 * Task 367 — Real `fetch()` implementation of `GraphDraftClient` for
 * Cloudflare Workers. Uses injected `GraphTokenProvider` for auth.
 *
 * Implements actual Microsoft Graph semantics:
 * - createDraftReply: POST /users/{scopeId}/messages/{parentMessageId}/createReply
 * - sendDraft: POST /users/{scopeId}/messages/{draftId}/send (returns 202 empty body)
 *
 * Errors are thrown with `{ status?, code?, message? }` so that
 * `GraphDraftSendAdapter.classifyError()` classifies them correctly.
 */

import type { GraphDraftClient } from "./graph-draft-send-adapter.js";
import type { GraphTokenProvider } from "./graph-token-provider.js";

interface GraphMessageResponse {
  id: string;
  internetMessageId?: string;
}

export interface FetchGraphDraftClientOptions {
  /** Graph API base URL. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

export class FetchGraphDraftClient implements GraphDraftClient {
  constructor(
    private readonly tokenProvider: GraphTokenProvider,
    private readonly options: FetchGraphDraftClientOptions = {},
  ) {}

  async createDraftReply(
    scopeId: string,
    outboundId: string,
    parentMessageId: string,
    body: string,
    subject?: string,
  ): Promise<{ draftId: string; internetMessageId?: string }> {
    const token = await this.tokenProvider.getToken(scopeId);
    const url = `${this.baseUrl}/users/${encodeURIComponent(scopeId)}/messages/${encodeURIComponent(parentMessageId)}/createReply`;

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-narada-outbound-id": outboundId,
      },
      body: JSON.stringify({
        body: { contentType: "text", content: body },
        ...(subject ? { subject } : {}),
      }),
    });

    if (!response.ok) {
      throw await this.buildError(response, "createDraftReply");
    }

    const data = (await response.json()) as GraphMessageResponse;
    return {
      draftId: data.id,
      internetMessageId: data.internetMessageId,
    };
  }

  async sendDraft(
    scopeId: string,
    draftId: string,
  ): Promise<{ sentMessageId?: string; internetMessageId?: string }> {
    const token = await this.tokenProvider.getToken(scopeId);
    const url = `${this.baseUrl}/users/${encodeURIComponent(scopeId)}/messages/${encodeURIComponent(draftId)}/send`;

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.buildError(response, "sendDraft");
    }

    // Graph returns 202 Accepted with an empty body on successful send.
    // sentMessageId is not available from this response; callers should
    // use draftId as the external ref fallback.
    if (response.status === 202) {
      return {};
    }

    // Defensive: if Graph ever returns a body, parse it gracefully.
    const text = await response.text();
    if (!text) return {};

    try {
      const data = JSON.parse(text) as GraphMessageResponse;
      return {
        sentMessageId: data.id,
        internetMessageId: data.internetMessageId,
      };
    } catch {
      return {};
    }
  }

  private get baseUrl(): string {
    return this.options.baseUrl ?? "https://graph.microsoft.com/v1.0";
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const timeoutMs = this.options.timeoutMs ?? 30_000;
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("timeout") || message.includes("aborted")) {
        throw { code: "TimeoutError", message: `Request timed out after ${timeoutMs}ms` };
      }
      throw { code: "NetworkError", message };
    }
  }

  private async buildError(
    response: Response,
    context: string,
  ): Promise<{ status: number; code: string; message: string }> {
    let code = "GraphError";
    let message = `${context} failed: ${response.status} ${response.statusText}`;

    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (body.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      // Non-JSON error body; fall back to status text
    }

    return { status: response.status, code, message };
  }
}
