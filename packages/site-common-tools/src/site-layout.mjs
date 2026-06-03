import { basename, join, normalize } from 'node:path';

export function siteControlRoot(siteRoot) {
  const normalized = normalize(siteRoot);
  return basename(normalized).toLowerCase() === '.narada'
    ? normalized
    : join(normalized, '.narada');
}
