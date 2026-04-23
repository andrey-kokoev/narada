/**
 * Crossing regime inspection surface.
 *
 * Read-only: lists and shows declared crossing regimes from the canonical
 * inventory. Does not mutate any state.
 *
 * @see packages/layers/control-plane/src/types/crossing-regime-inventory.ts
 */

import {
  CROSSING_REGIME_INVENTORY,
  type CrossingClassification,
  type CrossingRegimeInventoryEntry,
} from '@narada2/control-plane';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface CrossingListOptions {
  format?: 'json' | 'human' | 'auto';
  classification?: string;
}

export interface CrossingShowOptions {
  format?: 'json' | 'human' | 'auto';
  name: string;
}

const ALL_CLASSIFICATIONS: CrossingClassification[] = [
  'canonical',
  'advisory',
  'deferred',
];

function parseClassificationFilter(
  input: string | undefined,
): CrossingClassification[] | undefined | 'invalid' {
  if (!input) return undefined;
  const parts = input.split(',').map((s) => s.trim());
  const valid = parts.filter((p): p is CrossingClassification =>
    ALL_CLASSIFICATIONS.includes(p as CrossingClassification),
  );
  return valid.length > 0 ? valid : 'invalid';
}

function pickOutputFields(
  entry: CrossingRegimeInventoryEntry,
): Record<string, unknown> {
  return {
    name: entry.name,
    description: entry.description,
    source_zone: entry.source_zone,
    destination_zone: entry.destination_zone,
    authority_owner: entry.authority_owner,
    admissibility_regime: entry.admissibility_regime,
    crossing_artifact: entry.crossing_artifact,
    confirmation_rule: entry.confirmation_rule,
    anti_collapse_invariant: entry.anti_collapse_invariant,
    documented_at: entry.documented_at,
    classification: entry.classification,
    classification_rationale: entry.classification_rationale ?? null,
  };
}

export async function crossingListCommand(
  options: CrossingListOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const classificationFilter = parseClassificationFilter(options.classification);

  const crossings =
    classificationFilter === 'invalid'
      ? []
      : CROSSING_REGIME_INVENTORY.filter((c) => {
          if (!classificationFilter) return true;
          return classificationFilter.includes(c.classification);
        });

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        count: crossings.length,
        filter: {
          classification: classificationFilter ?? null,
        },
        crossings: crossings.map(pickOutputFields),
      },
    };
  }

  if (crossings.length === 0) {
    fmt.message('No crossing regimes match the filter', 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', count: 0, crossings: [] },
    };
  }

  const filterDesc =
    classificationFilter === 'invalid'
      ? 'classification=invalid'
      : classificationFilter
        ? `classification=${classificationFilter.join(',')}`
        : 'all';
  fmt.section(`Crossing Regimes (${crossings.length}) — ${filterDesc}`);

  const rows = crossings.map((c) => ({
    name: c.name,
    zones: `${c.source_zone} → ${c.destination_zone}`,
    authority: c.authority_owner,
    artifact: c.crossing_artifact,
    classification: c.classification,
  }));

  fmt.table(
    [
      { key: 'name' as const, label: 'Name', width: 24 },
      { key: 'zones' as const, label: 'Zones', width: 22 },
      { key: 'authority' as const, label: 'Authority', width: 24 },
      { key: 'artifact' as const, label: 'Artifact', width: 30 },
      { key: 'classification' as const, label: 'Class', width: 10 },
    ],
    rows,
  );

  // Show deferred/advisory warnings
  const nonCanonical = crossings.filter(
    (c) => c.classification !== 'canonical',
  );
  if (nonCanonical.length > 0) {
    console.log('');
    for (const c of nonCanonical) {
      const prefix = c.classification === 'deferred' ? 'Deferred' : 'Advisory';
      fmt.message(
        `${prefix}: ${c.name} — ${c.classification_rationale ?? 'No rationale provided'}`,
        c.classification === 'deferred' ? 'warning' : 'info',
      );
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      count: crossings.length,
      filter: { classification: classificationFilter ?? null },
      crossings: crossings.map(pickOutputFields),
    },
  };
}

export async function crossingShowCommand(
  options: CrossingShowOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });

  const entry = CROSSING_REGIME_INVENTORY.find(
    (c) => c.name.toLowerCase() === options.name.toLowerCase(),
  );

  if (!entry) {
    const available = CROSSING_REGIME_INVENTORY.map((c) => c.name);
    const error = `Crossing regime "${options.name}" not found. Available: ${available.join(', ')}`;
    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error, available },
      };
    }
    fmt.message(error, 'error');
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error, available },
    };
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        crossing: pickOutputFields(entry),
      },
    };
  }

  fmt.section(entry.name);
  fmt.kv('Description', entry.description);
  fmt.kv('Source zone', entry.source_zone);
  fmt.kv('Destination zone', entry.destination_zone);
  fmt.kv('Authority owner', entry.authority_owner);
  fmt.kv('Admissibility regime', entry.admissibility_regime);
  fmt.kv('Crossing artifact', entry.crossing_artifact);
  fmt.kv('Confirmation rule', entry.confirmation_rule);
  fmt.kv('Anti-collapse invariant', entry.anti_collapse_invariant);
  fmt.kv('Documented at', entry.documented_at);
  fmt.kv('Classification', entry.classification);
  if (entry.classification_rationale) {
    fmt.kv('Classification rationale', entry.classification_rationale);
  }

  if (entry.classification === 'deferred') {
    console.log('');
    fmt.message(
      'This crossing is deferred — its canonical status awaits further evidence.',
      'warning',
    );
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      crossing: pickOutputFields(entry),
    },
  };
}
