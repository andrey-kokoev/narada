/**
 * Typed policy documents. Hard constraints, preferences, defaults, and
 * eligibility are distinct kinds, each owned by exactly one authority
 * locus (target-Site, User-Site, Host-Site). Rule types are restricted
 * per policy kind so a contradictory document (e.g. a preferences doc
 * containing a hard constraint) is rejected by validation.
 */

import type { AssertionValue, CapabilityKey } from "./assertions.js";
import type { ResourceRef } from "./ids.js";

export const POLICY_SCHEMA = "narada.invokable-intelligence.policy.v1" as const;

export type PolicyLocus = "target-site" | "user-site" | "host-site";
export type PolicyKind = "hard-constraints" | "preferences" | "defaults" | "eligibility";

export type PolicyRule =
  | { type: "require-capability"; capability: CapabilityKey; reason?: string }
  | { type: "forbid-capability"; capability: CapabilityKey; reason?: string }
  | { type: "forbid-resource"; resource: ResourceRef; reason?: string }
  | { type: "prefer-resource"; resource: ResourceRef; weight: number; reason?: string }
  | { type: "prefer-capability"; capability: CapabilityKey; weight: number; reason?: string }
  | { type: "default-option"; option: string; value: AssertionValue; reason?: string }
  | { type: "allow-resource"; resource: ResourceRef; reason?: string }
  | { type: "deny-resource"; resource: ResourceRef; reason?: string };

/** Rule types permitted per policy kind — the contradiction fence. */
export const POLICY_KIND_RULES: Record<PolicyKind, readonly PolicyRule["type"][]> = {
  "hard-constraints": ["require-capability", "forbid-capability", "forbid-resource"],
  preferences: ["prefer-resource", "prefer-capability"],
  defaults: ["default-option"],
  eligibility: ["allow-resource", "deny-resource"],
};

export interface PolicyDocument {
  schema: typeof POLICY_SCHEMA;
  /** Policy-local identity, e.g. `policy:<slug>`. Not a ResourceId. */
  id: string;
  locus: PolicyLocus;
  /** The Site that owns this policy. Must reference a Site resource. */
  site: ResourceRef;
  kind: PolicyKind;
  rules: PolicyRule[];
  /** Bumped by the owner on each revision; resolution never infers precedence from insertion order. */
  revision: number;
}
