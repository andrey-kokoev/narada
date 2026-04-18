/**
 * Deterministic Fact Identity
 *
 * fact_id is computed from source-neutral kernel-visible fields to guarantee
 * replay stability and duplicate tolerance across repeated source pulls.
 */

import { createHash } from "node:crypto";
import { stableStringify } from "./event-id.js";
import type { FactType, FactProvenance } from "../facts/types.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface BuildFactIdInput {
  fact_type: FactType;
  provenance: FactProvenance;
  payload: unknown;
}

/**
 * Build a deterministic fact identifier.
 *
 * Identity material includes:
 * - fact_type
 * - source_id
 * - source_record_id
 * - canonical payload
 *
 * Excluded from identity (provenance metadata only):
 * - source_version
 * - source_cursor
 * - observed_at
 */
export function buildFactId(input: BuildFactIdInput): string {
  const material = stableStringify({
    fact_type: input.fact_type,
    source_id: input.provenance.source_id,
    source_record_id: input.provenance.source_record_id,
    payload: input.payload,
  });
  return `fact_${sha256(material).slice(0, 32)}`;
}
