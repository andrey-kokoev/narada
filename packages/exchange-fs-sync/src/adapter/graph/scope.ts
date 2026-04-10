import type { GraphMessageFlag } from "../../types/graph.js";

export function normalizeFolderRef(parentFolderId?: string): string[] {
  const id = parentFolderId?.trim();
  return id ? [id] : [];
}

export function normalizeFlagged(flag?: GraphMessageFlag): boolean {
  return flag?.flagStatus === "flagged" || flag?.flagStatus === "complete";
}
