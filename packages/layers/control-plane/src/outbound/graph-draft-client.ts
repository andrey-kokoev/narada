/**
 * Graph Draft Client
 *
 * Thin wrapper around GraphHttpClient for draft lifecycle operations.
 */

import type { GraphHttpClient } from "../adapter/graph/client.js";

export interface GraphDraftRecipient {
  emailAddress: {
    address: string;
  };
}

export interface CreateDraftPayload {
  subject: string;
  body: {
    contentType: "Text" | "HTML";
    content: string;
  };
  toRecipients: GraphDraftRecipient[];
  ccRecipients?: GraphDraftRecipient[];
  bccRecipients?: GraphDraftRecipient[];
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  replyTo?: GraphDraftRecipient[];
}

export interface DraftReadResult {
  id: string;
  subject?: string;
  body?: {
    contentType: string;
    content: string;
  };
  toRecipients?: GraphDraftRecipient[];
  ccRecipients?: GraphDraftRecipient[];
  bccRecipients?: GraphDraftRecipient[];
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  internetMessageId?: string;
}

export interface GraphDraftClient {
  createDraft(userId: string, payload: CreateDraftPayload): Promise<{ id: string }>;
  getDraft(userId: string, draftId: string): Promise<DraftReadResult>;
  sendDraft(userId: string, draftId: string): Promise<void>;
}

export interface GraphDraftClientOptions {
  httpClient: GraphHttpClient;
}

export class DefaultGraphDraftClient implements GraphDraftClient {
  private readonly httpClient: GraphHttpClient;

  constructor(opts: GraphDraftClientOptions) {
    this.httpClient = opts.httpClient;
  }

  async createDraft(userId: string, payload: CreateDraftPayload): Promise<{ id: string }> {
    return this.httpClient.postJson<{ id: string }>(
      `/users/${encodeURIComponent(userId)}/messages`,
      payload,
    );
  }

  async getDraft(userId: string, draftId: string): Promise<DraftReadResult> {
    return this.httpClient.getJson<DraftReadResult>(
      `/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(draftId)}?$select=id,subject,body,toRecipients,ccRecipients,bccRecipients,internetMessageHeaders,internetMessageId`,
    );
  }

  async sendDraft(userId: string, draftId: string): Promise<void> {
    await this.httpClient.postJson<unknown>(
      `/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(draftId)}/send`,
      {},
    );
  }
}
