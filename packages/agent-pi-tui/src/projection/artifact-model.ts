import type { PiRenderableContent, PiRowViewModel } from '../types.js';

export function artifactRows(rows: readonly PiRowViewModel[]): PiRowViewModel[] {
  return rows.filter((row) => row.content.some((part) => part.type === 'artifact_ref' || part.type === 'image'));
}

export function artifactParts(rows: readonly PiRowViewModel[]): PiRenderableContent[] {
  return rows.flatMap((row) => row.content.filter((part) => part.type === 'artifact_ref' || part.type === 'image'));
}

