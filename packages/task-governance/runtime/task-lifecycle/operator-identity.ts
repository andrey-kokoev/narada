/**
 * Determine whether a review record represents a single-operator review
 * by looking for the annotation in findings_json.
 */
export function isSingleOperatorReview(reviewRow: any) : any {
  if (!reviewRow?.findings_json) return false;
  try {
    const findings: any = JSON.parse(reviewRow.findings_json);
    if (!Array.isArray(findings)) return false;
    return findings.some((f)  =>
      f.location === 'review_authority' &&
      typeof f.description === 'string' &&
      f.description.includes('single_operator_review')
    );
  } catch {
    return false;
  }
}

/**
 * Extract single-operator review metadata from a review row.
 */
export function getSingleOperatorReviewMeta(reviewRow: any) : any {
  if (!reviewRow?.findings_json) return null;
  try {
    const findings: any = JSON.parse(reviewRow.findings_json);
    if (!Array.isArray(findings)) return null;
    const annotation: any = findings.find((f) : any =>
      f.location === 'review_authority' &&
      typeof f.description === 'string' &&
      f.description.includes('single_operator_review')
    );
    if (!annotation) return null;
    const kindMatch: any = annotation.description.match(/kind:\s*(\w+)/);
    return {
      single_operator_review: true,
      kind: kindMatch ? kindMatch[1] : 'unknown',
      description: annotation.description,
    };
  } catch {
    return null;
  }
}

/**
 * Operator identity helpers for same-operator review and self-review detection.
 */

export function getOperatorIdentity(store: any, agentId: any) : any {
  try {
    const row: any = store.db.prepare("SELECT operator_identity FROM agent_roster WHERE agent_id = ?").get(agentId);
    return row?.operator_identity ?? null;
  } catch {
    return null;
  }
}

export function detectSameOperatorReview(store: any, reviewerAgent: any, taskNumber: any) : any {
  try {
    const reviewerIdentity: any = getOperatorIdentity(store, reviewerAgent);
    if (!reviewerIdentity) return { sameOperator: false };

    const lifecycle: any = store.db.prepare("SELECT task_id FROM task_lifecycle WHERE task_number = ?").get(taskNumber);
    if (!lifecycle?.task_id) return { sameOperator: false };

    const reportRow: any = store.db.prepare(
      "SELECT agent_id FROM task_reports WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1"
    ).get(lifecycle.task_id);
    if (!reportRow?.agent_id) return { sameOperator: false };

    const finisherAgent: any = reportRow.agent_id;
    if (finisherAgent === reviewerAgent) return { sameOperator: false };

    const finisherIdentity: any = getOperatorIdentity(store, finisherAgent);
    if (finisherIdentity !== reviewerIdentity) return { sameOperator: false };

    return {
      sameOperator: true,
      reviewerAgent,
      finisherAgent,
      operatorIdentity: reviewerIdentity,
      warning: `Same-operator review detected: reviewer ${reviewerAgent} and finisher ${finisherAgent} both map to operator_identity '${reviewerIdentity}'.`,
    };
  } catch {
    return { sameOperator: false };
  }
}

/**
 * Detect true self-review (reviewer is the same agent who finished the task)
 * or singleton-role review (no other agents in the role with review capability).
 */
export function detectSelfReview(store: any, reviewerAgent: any, taskNumber: any) : any {
  try {
    const lifecycle: any = store.db.prepare("SELECT task_id FROM task_lifecycle WHERE task_number = ?").get(taskNumber);
    if (!lifecycle?.task_id) return { selfReview: false };

    const reportRow: any = store.db.prepare(
      "SELECT agent_id FROM task_reports WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1"
    ).get(lifecycle.task_id);
    if (!reportRow?.agent_id) return { selfReview: false };

    const finisherAgent: any = reportRow.agent_id;

    // True self-review: same agent who finished the task
    if (finisherAgent === reviewerAgent) {
      const reviewerIdentity: any = getOperatorIdentity(store, reviewerAgent);
      return {
        selfReview: true,
        kind: 'same_agent',
        reviewerAgent,
        finisherAgent,
        operatorIdentity: reviewerIdentity,
        warning: `Self-review detected: reviewer ${reviewerAgent} is the same agent who finished the task.`,
      };
    }

    // Singleton role: check if reviewer is the only agent in their role with review capability
    const reviewerRow: any = store.db.prepare("SELECT role, operator_identity FROM agent_roster WHERE agent_id = ?").get(reviewerAgent);
    if (!reviewerRow?.role) return { selfReview: false };

    const peerCount: any = store.db.prepare(
      `SELECT COUNT(*) AS count FROM agent_roster
       WHERE role = ? AND agent_id != ? AND status = 'active'
       AND (capabilities_json LIKE '%review%' OR capabilities_json LIKE '%task_review%' OR capabilities_json LIKE '%architect_as_reviewer%')`
    ).get(reviewerRow.role, reviewerAgent);

    if (peerCount?.count === 0) {
      return {
        selfReview: true,
        kind: 'singleton_role',
        reviewerAgent,
        finisherAgent,
        operatorIdentity: reviewerRow.operator_identity,
        role: reviewerRow.role,
        warning: `Singleton-role review detected: reviewer ${reviewerAgent} (role '${reviewerRow.role}') has no peer reviewers available.`,
      };
    }

    return { selfReview: false };
  } catch {
    return { selfReview: false };
  }
}
