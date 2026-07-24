import { ref, unref, watch, type Ref } from 'vue';
import { isRecord, type UnknownRecord } from '../../types.ts';

export type FaviconSource = 'tab' | 'agent_identity' | 'site_config' | 'narada_default';

export interface FaviconDescriptor {
  href: string;
  type: string | null;
  sizes: string | null;
  source: FaviconSource;
}

export const NARADA_DEFAULT_FAVICON: FaviconDescriptor = Object.freeze({
  href: './narada-favicon.svg',
  type: 'image/svg+xml',
  sizes: 'any',
  source: 'narada_default',
});

const SOURCES = new Set<FaviconSource>(['tab', 'agent_identity', 'site_config', 'narada_default']);

export function resolveFaviconDescriptor({
  tab = null,
  agentIdentity = null,
  siteConfig = null,
  defaultDescriptor = NARADA_DEFAULT_FAVICON,
}: {
  tab?: unknown;
  agentIdentity?: unknown;
  siteConfig?: unknown;
  defaultDescriptor?: FaviconDescriptor;
} = {}): FaviconDescriptor | null {
  return normalizeFaviconDescriptor(tab, 'tab')
    ?? normalizeFaviconDescriptor(agentIdentity, 'agent_identity')
    ?? normalizeFaviconDescriptor(siteConfig, 'site_config')
    ?? normalizeFaviconDescriptor(defaultDescriptor, 'narada_default');
}

export function extractFaviconCandidatesFromHealth(healthBody: unknown): {
  agentIdentity: unknown;
  siteConfig: unknown;
} {
  const agentIdentity = objectField(healthBody, 'agent_identity_ref')
    ?? objectField(healthBody, 'agent_identity')
    ?? objectField(healthBody, 'identity');
  const siteConfig = objectField(healthBody, 'site_config')
    ?? objectField(healthBody, 'siteConfig');
  return {
    agentIdentity: faviconField(agentIdentity),
    siteConfig: faviconField(siteConfig),
  };
}

export function normalizeFaviconDescriptor(
  value: unknown,
  sourceFallback: FaviconSource,
): FaviconDescriptor | null {
  const descriptor: unknown = typeof value === 'string' ? { href: value } : value;
  if (!isRecord(descriptor)) return null;
  const href = stringField(descriptor, 'href')
    ?? stringField(descriptor, 'url')
    ?? stringField(descriptor, 'icon');
  if (!href || !isSafeFaviconHref(href)) return null;
  const candidateSource = stringField(descriptor, 'source');
  const source: FaviconSource = candidateSource && SOURCES.has(candidateSource as FaviconSource)
    ? candidateSource as FaviconSource
    : sourceFallback;
  return {
    href,
    type: stringField(descriptor, 'type'),
    sizes: stringField(descriptor, 'sizes'),
    source,
  };
}

export function isSafeFaviconHref(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const href = value.trim();
  if (!href) return false;
  if (/^data:image\/svg\+xml(?:;[^,;]+)*[,;]/i.test(href)) return true;
  if (/^https:\/\//i.test(href)) return true;
  if (/^(?:\.\.?\/|\/)(?!\/)/.test(href)) return true;
  if (/^[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@/-]*$/.test(href)
    && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href)) return true;
  return false;
}

export function applyManagedFavicon(
  descriptor: FaviconDescriptor | null,
  documentRef: Document | undefined = globalThis.document,
): HTMLLinkElement | null {
  if (!documentRef?.head || !descriptor) return null;
  let link = documentRef.querySelector<HTMLLinkElement>('link[data-narada-managed-favicon="true"]');
  if (!link) {
    link = documentRef.createElement('link');
    link.setAttribute('data-narada-managed-favicon', 'true');
    documentRef.head.appendChild(link);
  }
  link.setAttribute('rel', 'icon');
  link.setAttribute('href', descriptor.href);
  link.setAttribute('data-narada-favicon-source', descriptor.source);
  setOptionalAttribute(link, 'type', descriptor.type);
  setOptionalAttribute(link, 'sizes', descriptor.sizes);
  return link;
}

export function useResolvedFavicon({
  tabOverride = ref<unknown>(null),
  healthBody,
  documentRef = globalThis.document,
}: {
  tabOverride?: Ref<unknown> | null;
  healthBody?: Ref<unknown> | unknown;
  documentRef?: Document;
} = {}): {
  tabOverride: Ref<unknown> | null;
  resolvedFavicon: Ref<FaviconDescriptor>;
  stop: () => void;
} {
  const resolvedFavicon = ref<FaviconDescriptor>(NARADA_DEFAULT_FAVICON);
  const stop = watch(
    [() => unref(tabOverride), () => unref(healthBody)],
    ([tab, health]: [unknown, unknown]) => {
      const candidates = extractFaviconCandidatesFromHealth(health);
      const resolved = resolveFaviconDescriptor({ tab, ...candidates });
      if (!resolved) return;
      resolvedFavicon.value = resolved;
      applyManagedFavicon(resolved, documentRef);
    },
    { immediate: true, deep: true },
  );
  return { tabOverride, resolvedFavicon, stop };
}

function faviconField(record: UnknownRecord | null): unknown {
  return objectField(record, 'favicon')
    ?? objectField(record, 'icon')
    ?? stringField(record, 'favicon')
    ?? stringField(record, 'icon')
    ?? null;
}

function objectField(record: unknown, field: string): UnknownRecord | null {
  if (!isRecord(record)) return null;
  const value = record[field];
  return isRecord(value) ? value : null;
}

function stringField(record: unknown, field: string): string | null {
  if (!isRecord(record)) return null;
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function setOptionalAttribute(element: Element, name: string, value: string | null): void {
  if (value) element.setAttribute(name, value);
  else element.removeAttribute(name);
}
