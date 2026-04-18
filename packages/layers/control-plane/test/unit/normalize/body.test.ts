import { describe, expect, it } from "vitest";
import { normalizeBody } from "../../../src/normalize/body.js";

describe("normalizeBody", () => {
  it("normalizes text body", () => {
    const result = normalizeBody(
      {
        contentType: "text",
        content: "hello\r\nworld",
      },
      "text_only",
    );

    expect(result.body_kind).toBe("text");
    expect(result.text).toBe("hello\nworld");
    expect(result.content_hashes?.text_sha256).toBeTruthy();
  });

  it("normalizes html body", () => {
    const result = normalizeBody(
      {
        contentType: "html",
        content: "<p>hello</p>",
      },
      "html_only",
    );

    expect(result.body_kind).toBe("html");
    expect(result.html).toBe("<p>hello</p>");
    expect(result.content_hashes?.html_sha256).toBeTruthy();
  });

  it("returns empty when content is absent", () => {
    const result = normalizeBody(undefined, "text_only");
    expect(result).toEqual({ body_kind: "empty" });
  });
});