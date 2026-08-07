import { describe, expect, it } from "vitest";
import { DefaultGraphAdapter } from "../../../src/adapter/graph/adapter.js";
import { StaticBearerTokenProvider } from "../../../src/adapter/graph/auth.js";
import { GraphHttpClient } from "../../../src/adapter/graph/client.js";
import {
  normalizeFlagged,
  normalizeFolderRef,
} from "../../../src/adapter/graph/scope.js";

describe("DefaultGraphAdapter", () => {
  it("uses the delegated /me resource instead of treating me as a user id", () => {
    const client = new GraphHttpClient({
      tokenProvider: new StaticBearerTokenProvider({ accessToken: "test-token" }),
    });

    expect(client.buildFolderMessagesDeltaUrl("me", "inbox"))
      .toBe("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta");
  });

  it("includes bounded Graph path context on authorization failures", async () => {
    const client = new GraphHttpClient({
      tokenProvider: new StaticBearerTokenProvider({ accessToken: "test-token" }),
      fetchImpl: async () => new Response(JSON.stringify({
        error: { code: "ErrorAccessDenied", message: "Access is denied." },
      }), { status: 403, headers: { "content-type": "application/json" } }),
    });

    await expect(client.getDeltaPage(client.buildFolderMessagesDeltaUrl("me", "inbox")))
      .rejects.toThrow("[graph_path:/v1.0/me/mailFolders/inbox/messages/delta]");
  });

  it("uses configured folder scope for delta URL and maps live message batch", async () => {
    const responses = [
      {
        value: [
          {
            id: "msg-1",
            changeKey: "ck-1",
            conversationId: "conv-1",
            subject: "hello",
            parentFolderId: "folder-1",
            isRead: false,
            isDraft: false,
            hasAttachments: false,
            body: {
              contentType: "text",
              content: "hello world",
            },
          },
        ],
        "@odata.deltaLink": "cursor-1",
      },
    ];

    const seenUrls: string[] = [];
    let callIndex = 0;

    const client = new GraphHttpClient({
      tokenProvider: new StaticBearerTokenProvider({
        accessToken: "test-token",
      }),
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        return new Response(JSON.stringify(responses[callIndex++]), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    const adapter = new DefaultGraphAdapter({
      mailbox_id: "mailbox_primary",
      user_id: "user@example.com",
      client,
      adapter_scope: {
        mailbox_id: "mailbox_primary",
        included_container_refs: ["custom-folder-id"],
        included_item_kinds: ["message"],
        attachment_policy: "metadata_only",
        body_policy: "text_only",
      },
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: normalizeFolderRef,
      normalize_flagged: normalizeFlagged,
    });

    const batch = await adapter.fetch_since(null);

    expect(seenUrls).toHaveLength(1);
    expect(seenUrls[0]).toContain("/mailFolders/custom-folder-id/messages/delta");
    expect(batch.mailbox_id).toBe("mailbox_primary");
    expect(batch.next_cursor).toBe("cursor-1");
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]?.event_kind).toBe("upsert");
    expect(batch.events[0]?.message_id).toBe("msg-1");
    expect(batch.events[0]?.payload?.folder_refs).toEqual(["folder-1"]);
    expect(
      batch.events[0]?.payload?.source_extensions?.namespaces.graph?.queried_folder_ref,
    ).toBe("custom-folder-id");
  });

  it("maps removed delta entries into delete events", async () => {
    const client = new GraphHttpClient({
      tokenProvider: new StaticBearerTokenProvider({
        accessToken: "test-token",
      }),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            value: [
              {
                id: "msg-2",
                changeKey: "ck-2",
                "@removed": { reason: "deleted" },
              },
            ],
            "@odata.deltaLink": "cursor-2",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    });

    const adapter = new DefaultGraphAdapter({
      mailbox_id: "mailbox_primary",
      user_id: "user@example.com",
      client,
      adapter_scope: {
        mailbox_id: "mailbox_primary",
        included_container_refs: ["folder-1"],
        included_item_kinds: ["message"],
        attachment_policy: "metadata_only",
        body_policy: "text_only",
      },
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: normalizeFolderRef,
      normalize_flagged: normalizeFlagged,
    });

    const batch = await adapter.fetch_since(null);

    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]?.event_kind).toBe("delete");
    expect(batch.events[0]?.message_id).toBe("msg-2");
  });

  it("supports multi-folder scope by fetching from each folder", async () => {
    const seenUrls: string[] = [];
    let callIndex = 0;

    const client = new GraphHttpClient({
      tokenProvider: new StaticBearerTokenProvider({
        accessToken: "test-token",
      }),
      fetchImpl: async (input) => {
        const url = String(input);
        seenUrls.push(url);
        return new Response(
          JSON.stringify({
            value: [
              {
                id: `msg-${callIndex}`,
                changeKey: `ck-${callIndex}`,
                conversationId: "conv-1",
                subject: "hello",
                parentFolderId: url.includes("folder-1")
                  ? "folder-1-id"
                  : "folder-2-id",
                isRead: false,
                isDraft: false,
                hasAttachments: false,
                body: { contentType: "text", content: "hello" },
              },
            ],
            "@odata.deltaLink": `cursor-${callIndex++}`,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    });

    const adapter = new DefaultGraphAdapter({
      mailbox_id: "mailbox_primary",
      user_id: "user@example.com",
      client,
      adapter_scope: {
        mailbox_id: "mailbox_primary",
        included_container_refs: ["folder-1", "folder-2"],
        included_item_kinds: ["message"],
        attachment_policy: "metadata_only",
        body_policy: "text_only",
      },
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: normalizeFolderRef,
      normalize_flagged: normalizeFlagged,
    });

    const batch = await adapter.fetch_since(null);

    expect(seenUrls).toHaveLength(2);
    expect(seenUrls[0]).toContain("/mailFolders/folder-1/messages/delta");
    expect(seenUrls[1]).toContain("/mailFolders/folder-2/messages/delta");
    expect(batch.events).toHaveLength(2);
    expect(batch.next_cursor).toBeDefined();

    const composite = JSON.parse(batch.next_cursor!);
    expect(composite["folder-1"]).toBe("cursor-0");
    expect(composite["folder-2"]).toBe("cursor-1");
    expect(
      batch.events.map((event) => event.payload?.source_extensions?.namespaces.graph?.queried_folder_ref),
    ).toEqual(["folder-1", "folder-2"]);

    const batch2 = await adapter.fetch_since(batch.next_cursor);
    expect(seenUrls).toHaveLength(4);
    expect(seenUrls[2]).toBe("cursor-0");
    expect(seenUrls[3]).toBe("cursor-1");
  });

  it("recovers a stale Graph delta cursor by restarting from the folder base delta URL", async () => {
    const seenUrls: string[] = [];
    let callIndex = 0;

    const client = new GraphHttpClient({
      tokenProvider: new StaticBearerTokenProvider({
        accessToken: "test-token",
      }),
      fetchImpl: async (input) => {
        seenUrls.push(String(input));
        if (callIndex++ === 0) {
          return new Response(JSON.stringify({ error: { code: "SyncStateNotFound", message: "Sync state not found." } }), {
            status: 410,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "msg-fresh",
                changeKey: "ck-fresh",
                conversationId: "conv-1",
                subject: "fresh sync",
                parentFolderId: "folder-1",
                isRead: false,
                isDraft: false,
                hasAttachments: false,
                body: { contentType: "text", content: "fresh" },
              },
            ],
            "@odata.deltaLink": "fresh-cursor",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
      retryConfig: { maxAttempts: 1 },
    });

    const adapter = new DefaultGraphAdapter({
      mailbox_id: "mailbox_primary",
      user_id: "user@example.com",
      client,
      adapter_scope: {
        mailbox_id: "mailbox_primary",
        included_container_refs: ["folder-1"],
        included_item_kinds: ["message"],
        attachment_policy: "metadata_only",
        body_policy: "text_only",
      },
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      include_headers: false,
      normalize_folder_ref: normalizeFolderRef,
      normalize_flagged: normalizeFlagged,
    });

    const batch = await adapter.fetch_since("stale-cursor");

    expect(seenUrls).toHaveLength(2);
    expect(seenUrls[0]).toBe("stale-cursor");
    expect(seenUrls[1]).toContain("/mailFolders/folder-1/messages/delta");
    expect(batch.prior_cursor).toBe("stale-cursor");
    expect(batch.next_cursor).toBe("fresh-cursor");
    expect(batch.events[0]?.message_id).toBe("msg-fresh");
  });

  it("hydrates attachments with bounded concurrency", async () => {
    const messages = Array.from({ length: 7 }, (_, index) => ({
      id: `msg-attachment-${index}`,
      changeKey: `ck-${index}`,
      conversationId: `conv-${index}`,
      subject: "attachment message",
      parentFolderId: "folder-1",
      isRead: false,
      isDraft: false,
      hasAttachments: true,
      body: { contentType: "text", content: "hello" },
    }));
    let attachmentRequests = 0;
    let maxAttachmentRequests = 0;

    const client = new GraphHttpClient({
      tokenProvider: new StaticBearerTokenProvider({ accessToken: "test-token" }),
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/messages/delta")) {
          return new Response(JSON.stringify({
            value: messages,
            "@odata.deltaLink": "attachment-cursor",
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        if (url.includes("/attachments")) {
          attachmentRequests += 1;
          maxAttachmentRequests = Math.max(maxAttachmentRequests, attachmentRequests);
          await new Promise((resolve) => setTimeout(resolve, 5));
          attachmentRequests -= 1;
          return new Response(JSON.stringify({
            value: [{ id: `attachment-${attachmentRequests}` }],
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        throw new Error(`Unexpected Graph URL: ${url}`);
      },
    });

    const adapter = new DefaultGraphAdapter({
      mailbox_id: "mailbox_primary",
      user_id: "user@example.com",
      client,
      adapter_scope: {
        mailbox_id: "mailbox_primary",
        included_container_refs: ["folder-1"],
        included_item_kinds: ["message"],
        attachment_policy: "metadata_only",
        body_policy: "text_only",
      },
      body_policy: "text_only",
      attachment_policy: "metadata_only",
      attachment_hydration_concurrency: 2,
      include_headers: false,
      normalize_folder_ref: normalizeFolderRef,
      normalize_flagged: normalizeFlagged,
    });

    const batch = await adapter.fetch_since(null);

    expect(batch.events).toHaveLength(messages.length);
    expect(maxAttachmentRequests).toBe(2);
  });
});
