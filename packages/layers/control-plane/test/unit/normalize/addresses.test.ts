import { describe, expect, it } from "vitest";
import {
  normalizeRecipient,
  normalizeRecipientList,
} from "../../../src/normalize/addresses.js";

describe("normalizeRecipient", () => {
  it("normalizes display name and lowercases email", () => {
    const result = normalizeRecipient({
      emailAddress: {
        name: " Alice Example ",
        address: "ALICE@EXAMPLE.COM ",
      },
    });

    expect(result).toEqual({
      display_name: "Alice Example",
      email: "alice@example.com",
    });
  });

  it("returns undefined for empty recipient", () => {
    expect(normalizeRecipient({})).toBeUndefined();
    expect(normalizeRecipient(undefined)).toBeUndefined();
  });
});

describe("normalizeRecipientList", () => {
  it("filters invalid recipients", () => {
    const result = normalizeRecipientList([
      { emailAddress: { name: "Bob", address: "bob@example.com" } },
      {},
    ]);

    expect(result).toEqual([
      {
        display_name: "Bob",
        email: "bob@example.com",
      },
    ]);
  });
});