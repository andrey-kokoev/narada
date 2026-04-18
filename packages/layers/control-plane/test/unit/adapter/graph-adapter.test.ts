import { describe, expect, it } from "vitest";
import { DefaultGraphAdapter } from "../../../src/adapter/graph/adapter.js";
import { StaticBearerTokenProvider } from "../../../src/adapter/graph/auth.js";
import { GraphHttpClient } from "../../../src/adapter/graph/client.js";
import {
  normalizeFlagged,
  normalizeFolderRef,
} from "../../../src/adapter/graph/scope.js";

describe("DefaultGraphAdapter", () => {
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

    const batch2 = await adapter.fetch_since(batch.next_cursor);
    expect(seenUrls).toHaveLength(4);
    expect(seenUrls[2]).toBe("cursor-0");
    expect(seenUrls[3]).toBe("cursor-1");
  });
});