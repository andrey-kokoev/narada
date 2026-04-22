/**
 * Learning recall helper for accepted learning artifacts.
 *
 * Reads `.ai/learning/accepted/*.json` and surfaces guidance scoped to
 * specific command surfaces. This helper is read-only — it never mutates
 * task, roster, assignment, report, review, or learning state.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type LearningScope =
  | 'task-governance'
  | 'roster'
  | 'assignment'
  | 'recommendation'
  | 'report'
  | 'review';

export interface AcceptedLearningArtifact {
  artifact_id: string;
  artifact_type?: string;
  state: string;
  title?: string;
  content?: {
    principle?: string;
    rationale?: string;
    contract_patch?: string;
    not_applicable_when?: string[];
    [key: string]: unknown;
  };
  scopes?: LearningScope[] | string[];
  not_applicable_when?: string[];
  [key: string]: unknown;
}

export interface LearningGuidance {
  artifact_id: string;
  title: string;
  principle: string;
  source_path: string;
  not_applicable_when: string[];
}

const ACCEPTED_DIR = '.ai/learning/accepted';

function isAcceptedArtifact(obj: unknown): obj is AcceptedLearningArtifact {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.artifact_id === 'string' &&
    o.state === 'accepted'
  );
}

function extractNotApplicableWhen(artifact: AcceptedLearningArtifact): string[] {
  const fromContent = artifact.content?.not_applicable_when;
  if (Array.isArray(fromContent)) {
    return fromContent.filter((s): s is string => typeof s === 'string');
  }
  if (Array.isArray(artifact.not_applicable_when)) {
    return artifact.not_applicable_when.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

function artifactMatchesScopes(
  artifact: AcceptedLearningArtifact,
  requestedScopes: LearningScope[],
): boolean {
  const artifactScopes = artifact.scopes ?? [];
  if (artifactScopes.length === 0) {
    // No scopes declared: conservatively do NOT surface automatically.
    return false;
  }
  return requestedScopes.some((scope) => artifactScopes.includes(scope));
}

/**
 * Read all accepted learning artifacts and return those matching the requested scopes.
 *
 * Malformed or non-accepted artifacts are silently skipped. Warnings are
 * returned separately so callers may surface them without crashing.
 */
export async function recallAcceptedLearning(options: {
  cwd: string;
  scopes: LearningScope[];
}): Promise<{ guidance: LearningGuidance[]; warnings: string[] }> {
  const acceptedDir = join(resolve(options.cwd), ACCEPTED_DIR);
  const guidance: LearningGuidance[] = [];
  const warnings: string[] = [];

  let files: string[];
  try {
    files = await readdir(acceptedDir);
  } catch {
    // Directory may not exist — return empty
    return { guidance, warnings };
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  for (const fileName of jsonFiles) {
    const filePath = join(acceptedDir, fileName);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch {
      warnings.push(`Skipping unreadable learning artifact: ${fileName}`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warnings.push(`Skipping malformed JSON in learning artifact: ${fileName}`);
      continue;
    }

    if (!isAcceptedArtifact(parsed)) {
      // Not an accepted artifact — skip without warning (candidates/rejected/etc.)
      continue;
    }

    if (!artifactMatchesScopes(parsed, options.scopes)) {
      continue;
    }

    const principle =
      parsed.content?.principle ??
      parsed.title ??
      '';

    guidance.push({
      artifact_id: parsed.artifact_id,
      title: parsed.title ?? parsed.artifact_id,
      principle,
      source_path: filePath,
      not_applicable_when: extractNotApplicableWhen(parsed),
    });
  }

  // Deterministic order by artifact_id
  guidance.sort((a, b) => a.artifact_id.localeCompare(b.artifact_id));

  return { guidance, warnings };
}

/**
 * Format guidance for concise human-readable display.
 * Returns at most `maxItems` lines, each prefixed with the artifact title.
 */
export function formatGuidanceForHumans(
  guidance: LearningGuidance[],
  maxItems = 3,
): string[] {
  return guidance.slice(0, maxItems).map((g) => {
    const truncated =
      g.principle.length > 120 ? g.principle.slice(0, 117) + '...' : g.principle;
    return `• ${g.title}: ${truncated}`;
  });
}

/**
 * Format guidance for structured JSON inclusion.
 */
export function formatGuidanceForJson(
  guidance: LearningGuidance[],
  maxItems = 3,
): Array<{
  artifact_id: string;
  title: string;
  principle: string;
  not_applicable_when: string[];
}> {
  return guidance.slice(0, maxItems).map((g) => ({
    artifact_id: g.artifact_id,
    title: g.title,
    principle: g.principle,
    not_applicable_when: g.not_applicable_when,
  }));
}
