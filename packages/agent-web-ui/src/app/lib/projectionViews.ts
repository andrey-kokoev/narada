export const PROJECTION_VIEW_FACETS = ['conversation', 'operations', 'diagnostics', 'protocol', 'raw'] as const;

export type ProjectionViewFacet = typeof PROJECTION_VIEW_FACETS[number];
export type CanonicalProjectionVerbosity = 'conversation' | 'operations' | 'diagnostics' | 'raw';

export interface ProjectionViewFacetOption {
  id: ProjectionViewFacet;
  label: string;
  description: string;
}

export interface CustomProjectionView {
  id: string;
  label: string;
  description: string;
  facets: ProjectionViewFacet[];
}

export interface ProjectionViewDraft {
  id?: string;
  label: string;
  description?: string;
  facets: readonly ProjectionViewFacet[];
}

export interface ProjectionViewOption extends CustomProjectionView {
  builtIn: boolean;
  canonicalVerbosity: CanonicalProjectionVerbosity;
}

export const PROJECTION_VIEW_FACET_OPTIONS: readonly ProjectionViewFacetOption[] = [
  { id: 'conversation', label: 'Conversation', description: 'Operator and agent messages.' },
  { id: 'operations', label: 'Operations', description: 'Tools, turns, queue, and session lifecycle.' },
  { id: 'diagnostics', label: 'Diagnostics', description: 'Errors, health faults, and reconfiguration signals.' },
  { id: 'protocol', label: 'Protocol evidence', description: 'Directives and provider protocol records.' },
  { id: 'raw', label: 'Raw records', description: 'Events without a higher-level classification.' },
];

const BUILT_IN_FACETS: Record<CanonicalProjectionVerbosity, ProjectionViewFacet[]> = {
  conversation: ['conversation'],
  operations: ['conversation', 'operations'],
  diagnostics: ['diagnostics'],
  raw: [...PROJECTION_VIEW_FACETS],
};

export const BUILT_IN_PROJECTION_VIEWS: readonly ProjectionViewOption[] = [
  {
    id: 'conversation',
    label: 'Chat',
    description: 'Human-readable conversation messages.',
    facets: BUILT_IN_FACETS.conversation,
    builtIn: true,
    canonicalVerbosity: 'conversation',
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Conversation plus tools and session operations.',
    facets: BUILT_IN_FACETS.operations,
    builtIn: true,
    canonicalVerbosity: 'operations',
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'Diagnostic signals and runtime faults.',
    facets: BUILT_IN_FACETS.diagnostics,
    builtIn: true,
    canonicalVerbosity: 'diagnostics',
  },
  {
    id: 'raw',
    label: 'Raw',
    description: 'All non-routine projected event records.',
    facets: BUILT_IN_FACETS.raw,
    builtIn: true,
    canonicalVerbosity: 'raw',
  },
];

export function customProjectionViewOption(view: CustomProjectionView): ProjectionViewOption {
  return {
    ...view,
    builtIn: false,
    canonicalVerbosity: transportVerbosityForFacets(view.facets),
  };
}

export function transportVerbosityForFacets(facets: readonly ProjectionViewFacet[]): CanonicalProjectionVerbosity {
  const selected = new Set(facets);
  if (selected.has('raw') || selected.has('protocol')) return 'raw';
  if (selected.has('diagnostics') && (selected.has('conversation') || selected.has('operations'))) return 'raw';
  if (selected.has('diagnostics')) return 'diagnostics';
  if (selected.has('operations')) return 'operations';
  return 'conversation';
}

export function facetForProjectionDisposition(disposition: string): ProjectionViewFacet | null {
  if (disposition === 'conversation_fact') return 'conversation';
  if (disposition === 'operation_fact') return 'operations';
  if (disposition === 'diagnostic_signal') return 'diagnostics';
  if (disposition === 'protocol_evidence') return 'protocol';
  if (disposition === 'raw_record') return 'raw';
  return null;
}

export function normalizeCustomProjectionView(value: unknown): CustomProjectionView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  const facets = Array.isArray(record.facets)
    ? [...new Set(record.facets.filter((facet): facet is ProjectionViewFacet => typeof facet === 'string' && PROJECTION_VIEW_FACETS.includes(facet as ProjectionViewFacet)))]
    : [];
  if (!/^custom:[a-z0-9][a-z0-9_-]{0,63}$/i.test(id) || !label || !facets.length) return null;
  const description = typeof record.description === 'string' && record.description.trim()
    ? record.description.trim().slice(0, 160)
    : describeFacets(facets);
  return {
    id,
    label: label.slice(0, 48),
    description,
    facets,
  };
}

export function sanitizeCustomProjectionViews(value: unknown): CustomProjectionView[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CustomProjectionView[] = [];
  for (const item of value) {
    const normalized = normalizeCustomProjectionView(item);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    result.push(normalized);
  }
  return result;
}

export function describeFacets(facets: readonly ProjectionViewFacet[]): string {
  const labels = PROJECTION_VIEW_FACET_OPTIONS
    .filter((option) => facets.includes(option.id))
    .map((option) => option.label);
  return labels.join(' · ');
}

export function isCanonicalProjectionVerbosity(value: string): value is CanonicalProjectionVerbosity {
  return value === 'conversation' || value === 'operations' || value === 'diagnostics' || value === 'raw';
}
