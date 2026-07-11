import { existsSync, readFileSync } from 'node:fs';

export function loadSession(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const entry = JSON.parse(line);
      return entry.role ? [entry] : [];
    } catch {
      return [];
    }
  });
}
