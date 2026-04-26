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
import { attachFormattedOutput } from '../lib/cli-output.js';

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
  const format = fmt.getFormat();
  const classificationFilter = parseClassificationFilter(options.classification);

  const crossings =
    classificationFilter === 'invalid'
      ? []
      : CROSSING_REGIME_INVENTORY.filter((c) => {
          if (!classificationFilter) return true;
          return classificationFilter.includes(c.classification);
        });

  const result = {
    status: 'success',
    count: crossings.length,
    filter: {
      classification: classificationFilter ?? null,
    },
    crossings: crossings.map(pickOutputFields),
  };

  if (format === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result,
    };
  }

  if (crossings.length === 0) {
    return {
      exitCode: ExitCode.SUCCESS,
      result: attachFormattedOutput(result, 'No crossing regimes match the filter', format),
    };
  }

  const filterDesc =
    classificationFilter === 'invalid'
      ? 'classification=invalid'
      : classificationFilter
        ? `classification=${classificationFilter.join(',')}`
        : 'all';
  const lines = [`Crossing Regimes (${crossings.length}) - ${filterDesc}`];
  for (const c of crossings) {
    lines.push(`${c.name}: ${c.source_zone} -> ${c.destination_zone}; authority=${c.authority_owner}; artifact=${c.crossing_artifact}; class=${c.classification}`);
  }

  const nonCanonical = crossings.filter(
    (c) => c.classification !== 'canonical',
  );
  if (nonCanonical.length > 0) {
    lines.push('');
    for (const c of nonCanonical) {
      const prefix = c.classification === 'deferred' ? 'Deferred' : 'Advisory';
      lines.push(`${prefix}: ${c.name} - ${c.classification_rationale ?? 'No rationale provided'}`);
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: attachFormattedOutput(result, lines.join('\n'), format),
  };
}

export async function crossingShowCommand(
  options: CrossingShowOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const format = fmt.getFormat();

  const entry = CROSSING_REGIME_INVENTORY.find(
    (c) => c.name.toLowerCase() === options.name.toLowerCase(),
  );

  if (!entry) {
    const available = CROSSING_REGIME_INVENTORY.map((c) => c.name);
    const error = `Crossing regime "${options.name}" not found. Available: ${available.join(', ')}`;
    if (format === 'json') {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error, available },
      };
    }
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: attachFormattedOutput({ status: 'error', error, available }, error, format),
    };
  }

  const result = {
    status: 'success',
    crossing: pickOutputFields(entry),
  };

  if (format === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result,
    };
  }

  const lines = [
    entry.name,
    `Description: ${entry.description}`,
    `Source zone: ${entry.source_zone}`,
    `Destination zone: ${entry.destination_zone}`,
    `Authority owner: ${entry.authority_owner}`,
    `Admissibility regime: ${entry.admissibility_regime}`,
    `Crossing artifact: ${entry.crossing_artifact}`,
    `Confirmation rule: ${entry.confirmation_rule}`,
    `Anti-collapse invariant: ${entry.anti_collapse_invariant}`,
    `Documented at: ${entry.documented_at}`,
    `Classification: ${entry.classification}`,
  ];
  if (entry.classification_rationale) {
    lines.push(`Classification rationale: ${entry.classification_rationale}`);
  }

  if (entry.classification === 'deferred') {
    lines.push('');
    lines.push('This crossing is deferred - its canonical status awaits further evidence.');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: attachFormattedOutput(result, lines.join('\n'), format),
  };
}
