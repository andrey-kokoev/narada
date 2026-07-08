import { ref, unref, watch } from 'vue';

export const NARADA_DEFAULT_FAVICON = Object.freeze({
  href: './narada-favicon.svg',
  type: 'image/svg+xml',
  sizes: 'any',
  source: 'narada_default',
});

const SOURCES = new Set(['tab', 'agent_identity', 'site_config', 'narada_default']);

export function resolveFaviconDescriptor({ tab = null, agentIdentity = null, siteConfig = null, defaultDescriptor = NARADA_DEFAULT_FAVICON } = {}) {
  return normalizeFaviconDescriptor(tab, 'tab')
    ?? normalizeFaviconDescriptor(agentIdentity, 'agent_identity')
    ?? normalizeFaviconDescriptor(siteConfig, 'site_config')
    ?? normalizeFaviconDescriptor(defaultDescriptor, 'narada_default');
}

export function extractFaviconCandidatesFromHealth(healthBody) {
  const agentIdentity = objectField(healthBody, 'agent_identity_ref') ?? objectField(healthBody, 'agent_identity') ?? objectField(healthBody, 'identity');
  const siteConfig = objectField(healthBody, 'site_config') ?? objectField(healthBody, 'siteConfig');
  return {
    agentIdentity: faviconField(agentIdentity),
    siteConfig: faviconField(siteConfig),
  };
}

export function normalizeFaviconDescriptor(value, sourceFallback) {
  const descriptor = typeof value === 'string' ? { href: value } : value;
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return null;
  const href = stringField(descriptor, 'href') ?? stringField(descriptor, 'url') ?? stringField(descriptor, 'icon');
  if (!isSafeFaviconHref(href)) return null;
  const source = SOURCES.has(stringField(descriptor, 'source')) ? stringField(descriptor, 'source') : sourceFallback;
  if (!SOURCES.has(source)) return null;
  return {
    href,
    type: stringField(descriptor, 'type'),
    sizes: stringField(descriptor, 'sizes'),
    source,
  };
}

export function isSafeFaviconHref(value) {
  if (typeof value !== 'string') return false;
  const href = value.trim();
  if (!href) return false;
  if (/^data:image\/svg\+xml(?:;[^,;]+)*[,;]/i.test(href)) return true;
  if (/^https:\/\//i.test(href)) return true;
  if (/^(?:\.\.?\/|\/)(?!\/)/.test(href)) return true;
  if (/^[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@/-]*$/.test(href) && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href)) return true;
  return false;
}

export function applyManagedFavicon(descriptor, documentRef = globalThis.document) {
  if (!documentRef?.head || !descriptor) return null;
  let link = documentRef.querySelector?.('link[data-narada-managed-favicon="true"]') ?? null;
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

/**
 * @param {{ tabOverride?: import('vue').Ref<unknown> | null, healthBody?: import('vue').Ref<unknown> | unknown, documentRef?: Document }} [options]
 */
export function useResolvedFavicon({ tabOverride = ref(null), healthBody, documentRef = globalThis.document } = {}) {
  const resolvedFavicon = ref(NARADA_DEFAULT_FAVICON);
  const stop = watch(
    [() => unref(tabOverride), () => unref(healthBody)],
    ([tab, health]) => {
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

function faviconField(record) {
  return objectField(record, 'favicon')
    ?? objectField(record, 'icon')
    ?? stringField(record, 'favicon')
    ?? stringField(record, 'icon')
    ?? null;
}

function objectField(record, field) {
  if (!record || typeof record !== 'object') return null;
  const value = record[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function stringField(record, field) {
  if (!record || typeof record !== 'object') return null;
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function setOptionalAttribute(element, name, value) {
  if (value) element.setAttribute(name, value);
  else element.removeAttribute?.(name);
}
