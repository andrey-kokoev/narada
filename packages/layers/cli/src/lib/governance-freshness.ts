export interface GovernanceFreshnessEvidence {
  stale_dist: boolean;
  accepted: boolean;
  source_paths: string[];
  command_identity: string;
  command_class: string | null;
  acceptance_reason: string | null;
  freshness_posture: string | null;
}

export function governanceFreshnessEvidence(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): GovernanceFreshnessEvidence | null {
  const accepted = env.NARADA_STALE_DIST_ACCEPTED === '1';
  const sourcePaths = splitSourcePaths(env.NARADA_STALE_DIST_SOURCE_PATHS);
  if (!accepted && sourcePaths.length === 0) return null;
  return {
    stale_dist: true,
    accepted,
    source_paths: sourcePaths,
    command_identity: env.NARADA_STALE_DIST_COMMAND?.trim() || command,
    command_class: env.NARADA_STALE_DIST_COMMAND_CLASS?.trim() || null,
    acceptance_reason: env.NARADA_STALE_DIST_ACCEPTANCE_REASON?.trim() || null,
    freshness_posture: env.NARADA_STALE_DIST_POSTURE?.trim() || null,
  };
}

function splitSourcePaths(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
