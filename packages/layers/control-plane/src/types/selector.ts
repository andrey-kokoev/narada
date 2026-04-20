/**
 * Canonical Selector type for the Selection operator family.
 *
 * Selection is the lens through which every other operator family operates.
 * A Selector bounds the input set of any operator without mutating state.
 * It is authority-agnostic: requiring no derive, resolve, or admin authority.
 */

export interface Selector {
  /** Scope selector: single scope, array of scopes, or omitted for all scopes */
  scopeId?: string | string[];
  /** Temporal lower bound (ISO 8601) */
  since?: string;
  /** Temporal upper bound (ISO 8601) */
  until?: string;
  /** Identity selector for facts */
  factIds?: string[];
  /** Identity selector for contexts */
  contextIds?: string[];
  /** Identity selector for work items */
  workItemIds?: string[];
  /** Status filter (family-specific enum value) */
  status?: string;
  /** Vertical filter for multi-vertical scopes */
  vertical?: string;
  /** Result-set limit */
  limit?: number;
  /** Result-set offset for pagination */
  offset?: number;
}

/** Read-only view constraint: selectors never mutate */
export type SelectorView = Readonly<Selector>;
