/**
 * Reactor Output Persistence
 *
 * Runtime integration: persists a reactor output to the coordinator store.
 *
 * Responsibility: runtime dispatch. Reactors return output only; this function
 * is called by the dispatch layer before governance and proposal materialization.
 */

import type { ReactorOutput, ReactorOutputStore } from "./types.js";
import type { ReactorOutputRow } from "../coordinator/types.js";

export function buildReactorOutputRow(output: ReactorOutput): ReactorOutputRow {
  return {
    output_id: output.output_id,
    reactor_id: output.reactor_id,
    charter_id: output.charter_id,
    context_id: output.context_id,
    scope_id: output.scope_id,
    evaluated_at: output.evaluated_at,
    outcome: output.outcome,
    confidence_json: JSON.stringify(output.confidence),
    summary: output.summary,
    proposals_json: JSON.stringify(output.proposals),
    escalation_json: output.escalation ? JSON.stringify(output.escalation) : null,
    created_at: output.evaluated_at,
  };
}

export function persistReactorOutput(
  output: ReactorOutput,
  store: ReactorOutputStore,
): ReactorOutputRow {
  const row = buildReactorOutputRow(output);
  const existing = store.getReactorOutputById(row.output_id);
  if (existing) {
    return existing;
  }
  store.insertReactorOutput(row);
  return row;
}
