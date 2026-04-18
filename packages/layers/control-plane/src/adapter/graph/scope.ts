import type { GraphDeltaMessage, GraphMessageFlag } from "../../types/graph.js";

export function normalizeFolderRef(graphMessage: GraphDeltaMessage): string[] {
  const id = graphMessage.parentFolderId?.trim();
  return id ? [id] : [];
}

export function normalizeFlagged(flag?: GraphMessageFlag): boolean {
  return flag?.flagStatus === "flagged" || flag?.flagStatus === "complete";
}
