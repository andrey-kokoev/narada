import { createHash } from "node:crypto";
import type {
  GraphAttachment,
  GraphFileAttachment,
  GraphItemAttachment,
  GraphReferenceAttachment,
} from "../types/graph.js";
import type {
  AttachmentPolicy,
  NormalizedAttachment,
  NormalizedExtensions,
} from "../types/normalized.js";

function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeString(value?: string | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function buildAttachmentKey(parts: Array<string | number | null | undefined>): string {
  const canonical = JSON.stringify(parts.map((part) => part ?? null));
  return `att_${sha256Hex(canonical)}`;
}

function buildContentHashFromBase64(contentBytes?: string): string | undefined {
  if (!contentBytes) {
    return undefined;
  }

  const bytes = Buffer.from(contentBytes, "base64");
  return sha256Hex(bytes);
}

function buildFileAttachmentExtensions(
  attachment: GraphFileAttachment,
): NormalizedExtensions | undefined {
  const graph: Record<string, unknown> = {};

  if (attachment.lastModifiedDateTime !== undefined) {
    graph.last_modified_at = attachment.lastModifiedDateTime;
  }

  if (!Object.keys(graph).length) {
    return undefined;
  }

  return { namespaces: { graph } };
}

function buildItemAttachmentExtensions(
  attachment: GraphItemAttachment,
): NormalizedExtensions | undefined {
  const graph: Record<string, unknown> = {
    odata_type: attachment["@odata.type"],
  };

  if (attachment.lastModifiedDateTime !== undefined) {
    graph.last_modified_at = attachment.lastModifiedDateTime;
  }

  return { namespaces: { graph } };
}

function buildReferenceAttachmentExtensions(
  attachment: GraphReferenceAttachment,
): NormalizedExtensions | undefined {
  const graph: Record<string, unknown> = {
    odata_type: attachment["@odata.type"],
  };

  if (attachment.sourceUrl !== undefined) {
    graph.source_url = attachment.sourceUrl;
  }
  if (attachment.providerType !== undefined) {
    graph.provider_type = attachment.providerType;
  }
  if (attachment.permission !== undefined) {
    graph.permission = attachment.permission;
  }
  if (attachment.isFolder !== undefined) {
    graph.is_folder = attachment.isFolder;
  }
  if (attachment.lastModifiedDateTime !== undefined) {
    graph.last_modified_at = attachment.lastModifiedDateTime;
  }

  return { namespaces: { graph } };
}

function normalizeFileAttachment(
  attachment: GraphFileAttachment,
  ordinal: number,
  attachmentPolicy: AttachmentPolicy,
): NormalizedAttachment {
  const display_name = normalizeString(attachment.name) ?? "";
  const content_hash = buildContentHashFromBase64(attachment.contentBytes);

  const attachment_key = buildAttachmentKey([
    "file",
    attachment.id,
    display_name,
    attachment.contentType,
    attachment.size,
    content_hash,
    ordinal,
  ]);

  const content_ref =
    attachmentPolicy === "include_content" && attachment.contentBytes
      ? `inline-base64:${attachment.contentBytes}`
      : undefined;

  return {
    attachment_key,
    ...(attachment.id ? { source_attachment_id: attachment.id } : {}),
    ordinal,
    display_name,
    ...(normalizeString(attachment.contentType)
      ? { content_type: normalizeString(attachment.contentType) }
      : {}),
    ...(typeof attachment.size === "number" ? { size_bytes: attachment.size } : {}),
    inline: Boolean(attachment.isInline),
    ...(normalizeString(attachment.contentId)
      ? { content_id: normalizeString(attachment.contentId) }
      : {}),
    ...(content_hash ? { content_hash } : {}),
    ...(content_ref ? { content_ref } : {}),
    ...(buildFileAttachmentExtensions(attachment)
      ? { source_extensions: buildFileAttachmentExtensions(attachment) }
      : {}),
  };
}

function normalizeItemAttachment(
  attachment: GraphItemAttachment,
  ordinal: number,
): NormalizedAttachment {
  const display_name = normalizeString(attachment.name) ?? "";

  const attachment_key = buildAttachmentKey([
    "item",
    attachment.id,
    display_name,
    attachment.contentType,
    attachment.size,
    ordinal,
  ]);

  return {
    attachment_key,
    ...(attachment.id ? { source_attachment_id: attachment.id } : {}),
    ordinal,
    display_name,
    ...(normalizeString(attachment.contentType)
      ? { content_type: normalizeString(attachment.contentType) }
      : {}),
    ...(typeof attachment.size === "number" ? { size_bytes: attachment.size } : {}),
    inline: Boolean(attachment.isInline),
    ...(normalizeString(attachment.contentId)
      ? { content_id: normalizeString(attachment.contentId) }
      : {}),
    ...(buildItemAttachmentExtensions(attachment)
      ? { source_extensions: buildItemAttachmentExtensions(attachment) }
      : {}),
  };
}

function normalizeReferenceAttachment(
  attachment: GraphReferenceAttachment,
  ordinal: number,
): NormalizedAttachment {
  const display_name = normalizeString(attachment.name) ?? "";

  const attachment_key = buildAttachmentKey([
    "reference",
    attachment.id,
    display_name,
    attachment.sourceUrl,
    attachment.providerType,
    ordinal,
  ]);

  const content_ref = normalizeString(attachment.sourceUrl);

  return {
    attachment_key,
    ...(attachment.id ? { source_attachment_id: attachment.id } : {}),
    ordinal,
    display_name,
    ...(normalizeString(attachment.contentType)
      ? { content_type: normalizeString(attachment.contentType) }
      : {}),
    ...(typeof attachment.size === "number" ? { size_bytes: attachment.size } : {}),
    inline: Boolean(attachment.isInline),
    ...(normalizeString(attachment.contentId)
      ? { content_id: normalizeString(attachment.contentId) }
      : {}),
    ...(content_ref ? { content_ref } : {}),
    ...(buildReferenceAttachmentExtensions(attachment)
      ? { source_extensions: buildReferenceAttachmentExtensions(attachment) }
      : {}),
  };
}

export function normalizeAttachments(
  attachments: GraphAttachment[] | undefined,
  attachmentPolicy: AttachmentPolicy,
): NormalizedAttachment[] {
  if (!attachments?.length || attachmentPolicy === "exclude") {
    return [];
  }

  const normalized = attachments.map((attachment, index) => {
    if (attachment["@odata.type"] === "#microsoft.graph.fileAttachment") {
      return normalizeFileAttachment(attachment as GraphFileAttachment, index, attachmentPolicy);
    }

    if (attachment["@odata.type"] === "#microsoft.graph.referenceAttachment") {
      return normalizeReferenceAttachment(attachment as GraphReferenceAttachment, index);
    }

    return normalizeItemAttachment(attachment as GraphItemAttachment, index);
  });

  return [...normalized].sort((a, b) =>
    a.attachment_key.localeCompare(b.attachment_key),
  );
}
