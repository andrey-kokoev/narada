/**
 * Fixture types for Construction Operation fixture (Task 414).
 *
 * These are isolated from production types and may diverge
 * for test-specific convenience.
 */

export interface FixtureTask {
  taskId: string;
  taskNumber: number;
  status: 'opened' | 'needs_continuation' | 'claimed' | 'in_review' | 'closed' | 'confirmed';
  title: string;
  dependsOn: number[];
  chapter: string | null;
  requiredCapabilities: string[];
  continuationAffinity?: {
    preferred_agent_id?: string;
    affinity_strength?: number;
    affinity_reason?: string;
  };
  body?: string;
}

export interface FixtureAgent {
  agent_id: string;
  role: string;
  capabilities: string[];
  status: 'idle' | 'working' | 'reviewing' | 'blocked' | 'done';
  current_task: number | null;
}

export interface FixturePrincipalRuntime {
  principal_id: string;
  state: string;
  budget_remaining: number | null;
  active_work_item_id: string | null;
}

export interface FixtureAssignment {
  task_id: string;
  agent_id: string;
  claimed_at: string;
  released_at: string | null;
  release_reason: 'completed' | 'abandoned' | 'superseded' | 'transferred' | 'budget_exhausted' | null;
}

export interface FixtureWriteSetManifest {
  declared_files: string[];
  declared_creates: string[];
  declared_deletes: string[];
}

export interface ScoreBreakdown {
  affinity: number;
  capability: number;
  load: number;
  history: number;
  review_separation: number;
  budget: number;
}

export interface CandidateAssignment {
  task_id: string;
  task_number: number;
  task_title: string;
  principal_id: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  breakdown: ScoreBreakdown;
  rationale: string;
}

export interface AbstainedTask {
  task_id: string;
  task_number: number;
  reason: string;
}

export interface AssignmentRecommendation {
  recommendation_id: string;
  generated_at: string;
  recommender_id: string;
  primary: CandidateAssignment | null;
  alternatives: CandidateAssignment[];
  abstained: AbstainedTask[];
  summary: string;
}

export interface SeparationCheckResult {
  checked: boolean;
  valid: boolean;
  worker_agent_id?: string;
  warning?: string;
}

export interface WriteSetConflict {
  type: 'file_overlap' | 'create_delete_conflict';
  task_a: string;
  task_b: string;
  agent_a: string;
  agent_b: string;
  overlapping_files: string[];
  severity: 'warning';
}

export interface FixtureReport {
  top1_accuracy: number;
  top3_accuracy: number;
  false_positive_rate: number;
  edge_cases_covered: string[];
  total_recommendations: number;
  total_abstained: number;
  total_conflicts: number;
}
