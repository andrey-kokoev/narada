import { describe, expect, it } from "vitest";
import { buildEventId, hashNormalizedPayload } from "../../../src/ids/event-id.js";
import { SCHEMA_VERSION } from "../../../src/types/index.js";

describe("event ids", () => {
  const payload = {
    schema_version: SCHEMA_VERSION,
    mailbox_id: "mailbox_primary",
    message_id: "msg-1",
    subject: "hello",
    reply_to: [],
    to: [],
    cc: [],
    bcc: [],
    folder_refs: ["inbox"],
    category_refs: [],
    flags: {
      is_read: false,
      is_draft: false,
      is_flagged: false,
      has_attachments: false,
    },
    body: {
      body_kind: "text" as const,
      text: "hello world",
    },
    attachments: [],
  };

  it("is deterministic for same inputs", () => {
    const a = buildEventId({
      mailbox_id: "mailbox_primary",
      message_id: "msg-1",
      event_kind: "upsert",
      source_version: "ck-1",
      payload,
    });

    const b = buildEventId({
      mailbox_id: "mailbox_primary",
      message_id: "msg-1",
      event_kind: "upsert",
      source_version: "ck-1",
      payload,
    });

    expect(a).toBe(b);
  });

  it("changes when source version changes", () => {
    const a = buildEventId({
      mailbox_id: "mailbox_primary",
      message_id: "msg-1",
      event_kind: "upsert",
      source_version: "ck-1",
      payload,
    });

    const b = buildEventId({
      mailbox_id: "mailbox_primary",
      message_id: "msg-1",
      event_kind: "upsert",
      source_version: "ck-2",
      payload,
    });

    expect(a).not.toBe(b);
  });

  it("hashes normalized payload deterministically", () => {
    const a = hashNormalizedPayload(payload);
    const b = hashNormalizedPayload(payload);
    expect(a).toBe(b);
  });
});