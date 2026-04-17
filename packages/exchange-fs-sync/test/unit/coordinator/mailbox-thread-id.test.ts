import { describe, it, expect } from "vitest";
import { deriveThreadId } from "../../../src/coordinator/mailbox-thread-id.js";
import type { NormalizedMessage } from "../../../src/types/normalized.js";

describe("deriveThreadId", () => {
  it("returns conversation_id as the canonical thread_id", () => {
    const message = {
      conversation_id: "conv-abc-123",
    } as NormalizedMessage;

    expect(deriveThreadId(message)).toBe("conv-abc-123");
  });
});
