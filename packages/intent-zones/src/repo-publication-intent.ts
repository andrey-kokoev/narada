/**
 * Repository Publication Intent Zone types.
 *
 * RPIZ owns the boundary between local repo state and remote publication. A
 * prepared bundle is only a handoff artifact; remote publication requires an
 * explicit confirmation result.
 */

export type RepoPublicationStatus =
  | 'prepared'
  | 'pushed'
  | 'failed'
  | 'abandoned';

export interface RepoPublicationRow {
  publication_id: string;
  repo_root: string;
  branch: string;
  remote: string;
  commit_hash: string;
  base_ref: string | null;
  bundle_path: string;
  patch_path: string | null;
  task_number: number | null;
  requester_id: string;
  requested_at: string;
  status: RepoPublicationStatus;
  pushed_at: string | null;
  confirmed_by: string | null;
  confirmation_json: string | null;
  failure_reason: string | null;
  updated_at: string;
}

export function generateRepoPublicationId(nowMs = Date.now()): string {
  return `rpi_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
}
