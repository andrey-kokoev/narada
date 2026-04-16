import { describe, it, expect } from "vitest";
import {
  getIntentFamily,
  validateIntent,
  assertValidIntent,
  INTENT_FAMILIES,
} from "../../../src/intent/registry.js";
import type { Intent } from "../../../src/intent/types.js";

describe("Intent Family Registry", () => {
  it("registers all known intent types", () => {
    const types = [
      "mail.send_reply",
      "mail.send_new_message",
      "mail.mark_read",
      "mail.move_message",
      "mail.draft_reply",
      "mail.set_categories",
      "process.run",
    ] as const;
    for (const t of types) {
      expect(INTENT_FAMILIES[t]).toBeDefined();
      expect(INTENT_FAMILIES[t].intent_type).toBe(t);
    }
  });

  it("getIntentFamily returns undefined for unknown types", () => {
    expect(getIntentFamily("unknown.type")).toBeUndefined();
  });

  it("validates a correct mail intent", () => {
    const intent: Pick<Intent, "intent_type" | "executor_family" | "payload_json"> = {
      intent_type: "mail.send_reply",
      executor_family: "mail",
      payload_json: JSON.stringify({ to: ["a@b.com"], subject: "Hello" }),
    };
    const result = validateIntent(intent);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.family.intent_type).toBe("mail.send_reply");
      expect(result.family.confirmation_model).toBe("implicit");
    }
  });

  it("validates a correct process intent", () => {
    const intent: Pick<Intent, "intent_type" | "executor_family" | "payload_json"> = {
      intent_type: "process.run",
      executor_family: "process",
      payload_json: JSON.stringify({ command: "/bin/echo", args: ["hi"] }),
    };
    const result = validateIntent(intent);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.family.confirmation_model).toBe("none");
    }
  });

  it("rejects unknown intent_type", () => {
    const result = validateIntent({
      intent_type: "custom.unknown" as Intent["intent_type"],
      executor_family: "process",
      payload_json: "{}",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Unregistered");
    }
  });

  it("rejects mismatched executor_family", () => {
    const result = validateIntent({
      intent_type: "process.run",
      executor_family: "mail",
      payload_json: JSON.stringify({ command: "/bin/echo" }),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('expects executor_family "process"');
    }
  });

  it("rejects invalid JSON payload", () => {
    const result = validateIntent({
      intent_type: "mail.send_reply",
      executor_family: "mail",
      payload_json: "not-json",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("Invalid JSON");
    }
  });

  it("rejects process.run without command", () => {
    const result = validateIntent({
      intent_type: "process.run",
      executor_family: "process",
      payload_json: JSON.stringify({ args: ["hi"] }),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("missing required field: command");
    }
  });

  it("rejects payload with wrong property type", () => {
    const result = validateIntent({
      intent_type: "process.run",
      executor_family: "process",
      payload_json: JSON.stringify({ command: 123 }),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("command");
      expect(result.reason).toContain("invalid type");
    }
  });

  it("allows empty object payload for mail intents", () => {
    const result = validateIntent({
      intent_type: "mail.mark_read",
      executor_family: "mail",
      payload_json: "{}",
    });
    expect(result.valid).toBe(true);
  });

  it("assertValidIntent throws on invalid intent", () => {
    expect(() =>
      assertValidIntent({
        intent_type: "process.run",
        executor_family: "process",
        payload_json: JSON.stringify({}),
      }),
    ).toThrow("missing required field: command");
  });

  it("assertValidIntent returns family on valid intent", () => {
    const family = assertValidIntent({
      intent_type: "mail.move_message",
      executor_family: "mail",
      payload_json: JSON.stringify({ destination_folder_id: "inbox" }),
    });
    expect(family.intent_type).toBe("mail.move_message");
  });
});
