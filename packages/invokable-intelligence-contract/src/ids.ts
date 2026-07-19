/**
 * Stable identities and typed references for the invokable-intelligence
 * ontology. Identity format is `<kind>:<slug>`; the kind is part of the
 * identity so a malformed reference is detectable without a registry lookup.
 */

export const RESOURCE_KINDS = [
  "inference-provider",
  "model-provider",
  "model",
  "inference-endpoint",
  "adapter",
  "credential-locator",
  "execution-locus",
  "site",
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** `<kind>:<slug>` — always carries its kind prefix. */
export type ResourceId = string;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export interface ResourceRef {
  kind: ResourceKind;
  /** Full identity, including the kind prefix. Must agree with `kind`. */
  id: ResourceId;
}

export function isResourceKind(value: unknown): value is ResourceKind {
  return typeof value === "string" && (RESOURCE_KINDS as readonly string[]).includes(value);
}

export function formatResourceId(kind: ResourceKind, slug: string): ResourceId {
  return `${kind}:${slug}`;
}

export function parseResourceId(id: unknown): { kind: ResourceKind; slug: string } | null {
  if (typeof id !== "string") return null;
  const sep = id.indexOf(":");
  if (sep <= 0) return null;
  const kind = id.slice(0, sep);
  const slug = id.slice(sep + 1);
  if (!isResourceKind(kind)) return null;
  if (!SLUG_PATTERN.test(slug)) return null;
  return { kind, slug };
}

export function resourceRef(kind: ResourceKind, slug: string): ResourceRef {
  return { kind, id: formatResourceId(kind, slug) };
}

export function refEquals(a: ResourceRef, b: ResourceRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}
