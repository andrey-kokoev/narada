/**
 * @narada/charters
 *
 * Charter contracts, knowledge sources, and coordinator bindings
 * for mailbox agents.
 */

export type {
  KnowledgeSourceType,
  KnowledgeKind,
  AuthorityLevel,
  KnowledgeSourceRef,
  UrlKnowledgeSource,
  LocalPathKnowledgeSource,
  SqliteKnowledgeSource,
  KnowledgeSource,
  KnowledgeProvenance,
  KnowledgeItem,
  MailboxKnowledgeBinding,
} from "./types/knowledge.js";

export {
  isUrlKnowledgeSource,
  isLocalPathKnowledgeSource,
  isSqliteKnowledgeSource,
  validateKnowledgeSource,
  validateKnowledgeItem,
} from "./types/knowledge.js";

export type {
  CharterId,
  InvocationMode,
  CharterInvocationPolicy,
  MailboxCharterBinding,
  CoordinatorConfig,
} from "./types/coordinator.js";

export { validateMailboxCharterBinding } from "./types/coordinator.js";
