import { createHash } from "node:crypto";
import type { GraphItemBody } from "../types/graph.js";
import type { BodyPolicy, NormalizedBody } from "../types/normalized.js";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeTextContent(value?: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeLineEndings(value);
}

function normalizeHtmlContent(value?: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeLineEndings(value);
}

export function normalizeBody(
  body: GraphItemBody | undefined,
  bodyPolicy: BodyPolicy,
  preview?: string,
): NormalizedBody {
  const contentType = body?.contentType;
  const content = body?.content ?? "";
  const normalizedPreview = preview ? normalizeLineEndings(preview) : undefined;

  if (!contentType || !content) {
    return {
      body_kind: "empty",
      ...(normalizedPreview ? { preview: normalizedPreview } : {}),
    };
  }

  if (contentType === "text") {
    const text = normalizeTextContent(content) ?? "";

    return {
      body_kind: "text",
      text,
      ...(normalizedPreview ? { preview: normalizedPreview } : {}),
      content_hashes: {
        text_sha256: sha256Hex(text),
      },
    };
  }

  if (contentType === "html") {
    const html = normalizeHtmlContent(content) ?? "";

    if (bodyPolicy === "text_only") {
      const text = html;

      return {
        body_kind: "text",
        text,
        ...(normalizedPreview ? { preview: normalizedPreview } : {}),
        content_hashes: {
          text_sha256: sha256Hex(text),
        },
      };
    }

    return {
      body_kind: "html",
      html,
      ...(normalizedPreview ? { preview: normalizedPreview } : {}),
      content_hashes: {
        html_sha256: sha256Hex(html),
      },
    };
  }

  return {
    body_kind: "empty",
    ...(normalizedPreview ? { preview: normalizedPreview } : {}),
  };
}
