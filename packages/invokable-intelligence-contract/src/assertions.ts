/**
 * Qualified capability assertions: what a resource can do, with scope,
 * provenance, validity/freshness, confidence, and evidence references.
 * Assertion families are open-ended (thinking, batch, off-peak, ...) —
 * new families require no contract change.
 */

import type { ResourceRef } from "./ids.js";

export const CAPABILITY_ASSERTION_SCHEMA = "narada.invokable-intelligence.capability-assertion.v1" as const;

/** Open capability vocabulary: { family: "thinking", name: "levels" }, { family: "batch", name: "available" }, ... */
export interface CapabilityKey {
  family: string;
  name: string;
}

export type AssertionValue = boolean | number | string | Record<string, unknown>;

/** Which authority locus this assertion is stated for. */
export type AssertionLocus = "global" | "target-site" | "user-site" | "host-site";

export interface AssertionScope {
  locus: AssertionLocus;
  /** Required when locus is site-scoped; must reference a Site resource. */
  site?: ResourceRef;
}

export type ProvenanceSource = "operator" | "migration" | "probe" | "inference" | "documented";

export interface Provenance {
  source: ProvenanceSource;
  /** ISO-8601 timestamp when the fact was recorded. */
  recorded_at: string;
  actor?: string;
  reference?: string;
}

export interface AssertionValidity {
  /** ISO-8601 interval bounds; valid_from must precede valid_until when both present. */
  valid_from?: string;
  valid_until?: string;
  /** ISO-8601: when the fact was last confirmed fresh. */
  fresh_as_of?: string;
}

export interface EvidenceRef {
  kind: "artifact" | "run" | "document" | "test";
  ref: string;
}

export interface CapabilityAssertion {
  schema: typeof CAPABILITY_ASSERTION_SCHEMA;
  /** Assertion-local identity, e.g. `assert:<slug>`. Not a ResourceId. */
  id: string;
  /** What the assertion is about — any resource ref (model, endpoint, adapter, ...). */
  subject: ResourceRef;
  capability: CapabilityKey;
  value: AssertionValue;
  scope: AssertionScope;
  provenance: Provenance;
  validity: AssertionValidity;
  /** 0..1 */
  confidence: number;
  evidence: EvidenceRef[];
}
