/**
 * Knowledge Source Contracts
 *
 * Defines how mailbox-specific knowledge is declared, normalized, and
 * passed into charter invocation context.
 *
 * Spec: .ai/tasks/20260413-008-mailbox-charter-knowledge-sources.md
 */

export type KnowledgeSourceType = "url" | "local_path" | "sqlite";

export type KnowledgeKind = "policy" | "reference" | "history" | "example";

export type AuthorityLevel = "low" | "medium" | "high";

/** Common reference shape for all knowledge sources */
export interface KnowledgeSourceRef {
  id: string;
  type: KnowledgeSourceType;
  enabled: boolean;
  purpose?: string;
}

/** URL-based knowledge source */
export interface UrlKnowledgeSource extends KnowledgeSourceRef {
  type: "url";
  urls: string[];
}

/** Local filesystem knowledge source */
export interface LocalPathKnowledgeSource extends KnowledgeSourceRef {
  type: "local_path";
  paths: string[];
}

/** SQLite-backed knowledge source */
export interface SqliteKnowledgeSource extends KnowledgeSourceRef {
  type: "sqlite";
  database_path: string;
  query_templates?: string[];
  tables?: string[];
}

/** Discriminated union of all concrete knowledge sources */
export type KnowledgeSource =
  | UrlKnowledgeSource
  | LocalPathKnowledgeSource
  | SqliteKnowledgeSource;

/** Provenance for a retrieved knowledge item */
export interface KnowledgeProvenance {
  source_type: KnowledgeSourceType;
  locator: string;
  detail?: string;
}

/** Normalized knowledge item consumed by charters */
export interface KnowledgeItem {
  knowledge_id: string;
  source_id: string;
  mailbox_id: string;
  charter_id: string;
  title: string;
  body: string;
  kind: KnowledgeKind;
  authority_level: AuthorityLevel;
  provenance: KnowledgeProvenance;
  tags: string[];
  retrieved_at: string;
}

/** Binding between a mailbox and its charter-scoped knowledge sources */
export interface MailboxKnowledgeBinding {
  mailbox_id: string;
  charter_knowledge: Record<string, KnowledgeSourceRef[]>;
}

/**
 * Type guard for URL knowledge sources.
 */
export function isUrlKnowledgeSource(
  source: KnowledgeSourceRef,
): source is UrlKnowledgeSource {
  return source.type === "url";
}

/**
 * Type guard for local path knowledge sources.
 */
export function isLocalPathKnowledgeSource(
  source: KnowledgeSourceRef,
): source is LocalPathKnowledgeSource {
  return source.type === "local_path";
}

/**
 * Type guard for SQLite knowledge sources.
 */
export function isSqliteKnowledgeSource(
  source: KnowledgeSourceRef,
): source is SqliteKnowledgeSource {
  return source.type === "sqlite";
}

/**
 * Validate that a knowledge source reference has required fields.
 */
export function validateKnowledgeSource(
  source: unknown,
): source is KnowledgeSource {
  if (typeof source !== "object" || source === null) return false;
  const s = source as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0) return false;
  if (typeof s.enabled !== "boolean") return false;

  const type = s.type;
  if (type === "url") {
    if (!Array.isArray(s.urls)) return false;
    if (s.urls.some((u: unknown) => typeof u !== "string")) return false;
    return true;
  }
  if (type === "local_path") {
    if (!Array.isArray(s.paths)) return false;
    if (s.paths.some((p: unknown) => typeof p !== "string")) return false;
    return true;
  }
  if (type === "sqlite") {
    if (typeof s.database_path !== "string" || s.database_path.length === 0) {
      return false;
    }
    if (
      s.query_templates !== undefined &&
      (!Array.isArray(s.query_templates) ||
        s.query_templates.some((q: unknown) => typeof q !== "string"))
    ) {
      return false;
    }
    if (
      s.tables !== undefined &&
      (!Array.isArray(s.tables) ||
        s.tables.some((t: unknown) => typeof t !== "string"))
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Validate that a knowledge item conforms to the normalized contract.
 */
export function validateKnowledgeItem(item: unknown): item is KnowledgeItem {
  if (typeof item !== "object" || item === null) return false;
  const i = item as Record<string, unknown>;
  if (typeof i.knowledge_id !== "string" || i.knowledge_id.length === 0) {
    return false;
  }
  if (typeof i.source_id !== "string" || i.source_id.length === 0) return false;
  if (typeof i.mailbox_id !== "string" || i.mailbox_id.length === 0) {
    return false;
  }
  if (typeof i.charter_id !== "string" || i.charter_id.length === 0) {
    return false;
  }
  if (typeof i.title !== "string") return false;
  if (typeof i.body !== "string") return false;
  const validKinds: KnowledgeKind[] = ["policy", "reference", "history", "example"];
  if (!validKinds.includes(i.kind as KnowledgeKind)) return false;
  const validAuthority: AuthorityLevel[] = ["low", "medium", "high"];
  if (!validAuthority.includes(i.authority_level as AuthorityLevel)) return false;
  if (
    typeof i.provenance !== "object" ||
    i.provenance === null ||
    typeof (i.provenance as Record<string, unknown>).locator !== "string"
  ) {
    return false;
  }
  if (!Array.isArray(i.tags) || i.tags.some((t: unknown) => typeof t !== "string")) {
    return false;
  }
  if (typeof i.retrieved_at !== "string" || i.retrieved_at.length === 0) {
    return false;
  }
  return true;
}
