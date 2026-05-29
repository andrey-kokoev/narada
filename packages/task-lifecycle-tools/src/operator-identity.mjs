/**
 * Determine whether a review record represents a single-operator review
 * by looking for the annotation in findings_json.
 */
export function isSingleOperatorReview(reviewRow) {
  if (!reviewRow?.findings_json) return false;
  try {
    const findings = JSON.parse(reviewRow.findings_json);
    if (!Array.isArray(findings)) return false;
    return findings.some((f) =>
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
export function getSingleOperatorReviewMeta(reviewRow) {
  if (!reviewRow?.findings_json) return null;
  try {
    const findings = JSON.parse(reviewRow.findings_json);
    if (!Array.isArray(findings)) return null;
    const annotation = findings.find((f) =>
      f.location === 'review_authority' &&
      typeof f.description === 'string' &&
      f.description.includes('single_operator_review')
    );
    if (!annotation) return null;
    const kindMatch = annotation.description.match(/kind:\s*(\w+)/);
    return {
      single_operator_review: true,
      kind: kindMatch ? kindMatch[1] : 'unknown',
      description: annotation.description,
    };
  } catch {
    return null;
  }
}

export function getReviewIndependenceMeta(store, reviewRow) {
  const singleOperatorMeta = getSingleOperatorReviewMeta(reviewRow);
  const reviewerAgent = reviewRow?.reviewer_agent_id ?? null;
  let finisherAgent = null;
  try {
    const reportRow = store.db.prepare(
      "SELECT agent_id FROM task_reports WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1"
    ).get(reviewRow.task_id);
    finisherAgent = reportRow?.agent_id ?? null;
  } catch {
    finisherAgent = null;
  }

  const reviewerOperatorIdentity = reviewerAgent ? getOperatorIdentity(store, reviewerAgent) : null;
  const finisherOperatorIdentity = finisherAgent ? getOperatorIdentity(store, finisherAgent) : null;
  const reviewerEqualsWorker = Boolean(reviewerAgent && finisherAgent && reviewerAgent === finisherAgent);
  const sameOperatorPrincipal = Boolean(
    reviewerAgent &&
    finisherAgent &&
    reviewerAgent !== finisherAgent &&
    reviewerOperatorIdentity &&
    reviewerOperatorIdentity === finisherOperatorIdentity
  );
  const limitationKind = singleOperatorMeta?.kind
    ?? (reviewerEqualsWorker ? 'same_agent' : (sameOperatorPrincipal ? 'same_operator' : null));

  return {
    schema: 'narada.task.review_independence.v0',
    independent_review: Boolean(finisherAgent && !reviewerEqualsWorker && !sameOperatorPrincipal && !singleOperatorMeta),
    reviewer_agent_id: reviewerAgent,
    worker_agent_id: finisherAgent,
    reviewer_operator_identity: reviewerOperatorIdentity,
    worker_operator_identity: finisherOperatorIdentity,
    reviewer_equals_worker: reviewerEqualsWorker,
    same_operator_principal: sameOperatorPrincipal,
    single_operator_annotation_present: Boolean(singleOperatorMeta),
    limitation_kind: limitationKind,
    limitation_reason: limitationKind
      ? `Review is not independent: ${limitationKind}.`
      : null,
  };
}

export const REVIEW_REPLAY_STATUSES = ['not_replayed', 'passed', 'failed', 'not_applicable'];

function parseReviewFindings(reviewRow) {
  if (!reviewRow?.findings_json) return [];
  try {
    const findings = JSON.parse(reviewRow.findings_json);
    return Array.isArray(findings) ? findings : [];
  } catch {
    return [];
  }
}

export function normalizeReviewReplayStatus(status) {
  if (!status) return 'not_replayed';
  return REVIEW_REPLAY_STATUSES.includes(status) ? status : null;
}

export function buildReviewAcceptanceProvenanceAnnotation({ verdict, reviewReplayStatus = 'not_replayed' }) {
  const replayStatus = normalizeReviewReplayStatus(reviewReplayStatus);
  if (!replayStatus) {
    throw new Error(`review_replay_status must be one of: ${REVIEW_REPLAY_STATUSES.join(', ')}`);
  }
  const accepted = ['accepted', 'accepted_with_notes'].includes(verdict);
  const provenance = {
    schema: 'narada.task.review.acceptance_provenance.v0',
    accepted,
    verdict,
    requested_replay_status: replayStatus,
  };
  return {
    severity: 'note',
    location: 'review_acceptance_provenance',
    description: `review_acceptance_provenance: ${JSON.stringify(provenance)}`,
    acceptance_provenance: provenance,
  };
}

export function getReviewAcceptanceProvenance(store, reviewRow) {
  const verdict = reviewRow?.verdict ?? null;
  const accepted = ['accepted', 'accepted_with_notes'].includes(verdict);
  const findings = parseReviewFindings(reviewRow);
  const annotation = findings.find((f) => f?.location === 'review_acceptance_provenance');
  const annotated = annotation?.acceptance_provenance && typeof annotation.acceptance_provenance === 'object'
    ? annotation.acceptance_provenance
    : null;
  const requestedReplayStatus = normalizeReviewReplayStatus(annotated?.requested_replay_status)
    ?? normalizeReviewReplayStatus(annotated?.replay_status)
    ?? 'not_replayed';
  const reviewIndependence = store ? getReviewIndependenceMeta(store, reviewRow) : null;
  const independentReview = Boolean(reviewIndependence?.independent_review);
  const replayStatus = requestedReplayStatus === 'passed' && independentReview ? 'passed' : requestedReplayStatus;
  const acceptanceProvenance = !accepted
    ? 'not_accepted'
    : (replayStatus === 'passed' && independentReview
      ? 'accepted_after_independent_replay'
      : 'accepted_from_governed_evidence');

  return {
    schema: 'narada.task.review.acceptance_provenance.v0',
    review_id: reviewRow?.review_id ?? null,
    verdict,
    accepted,
    acceptance_provenance: acceptanceProvenance,
    replay_status: replayStatus,
    requested_replay_status: requestedReplayStatus,
    independent_review: independentReview,
    reviewer_agent_id: reviewRow?.reviewer_agent_id ?? null,
    worker_agent_id: reviewIndependence?.worker_agent_id ?? null,
    reviewer_equals_worker: reviewIndependence?.reviewer_equals_worker ?? false,
    same_operator_principal: reviewIndependence?.same_operator_principal ?? false,
    single_operator_annotation_present: reviewIndependence?.single_operator_annotation_present ?? false,
    limitation_kind: reviewIndependence?.limitation_kind ?? null,
    limitation_reason: reviewIndependence?.limitation_reason ?? null,
    annotation_present: Boolean(annotation),
  };
}

/**
 * Operator identity helpers for same-operator review and self-review detection.
 */

export function getOperatorIdentity(store, agentId) {
  try {
    const row = store.db.prepare("SELECT operator_identity FROM agent_roster WHERE agent_id = ?").get(agentId);
    return row?.operator_identity ?? null;
  } catch {
    return null;
  }
}

export function detectSameOperatorReview(store, reviewerAgent, taskNumber) {
  try {
    const reviewerIdentity = getOperatorIdentity(store, reviewerAgent);
    if (!reviewerIdentity) return { sameOperator: false };

    const lifecycle = store.db.prepare("SELECT task_id FROM task_lifecycle WHERE task_number = ?").get(taskNumber);
    if (!lifecycle?.task_id) return { sameOperator: false };

    const reportRow = store.db.prepare(
      "SELECT agent_id FROM task_reports WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1"
    ).get(lifecycle.task_id);
    if (!reportRow?.agent_id) return { sameOperator: false };

    const finisherAgent = reportRow.agent_id;
    if (finisherAgent === reviewerAgent) return { sameOperator: false };

    const finisherIdentity = getOperatorIdentity(store, finisherAgent);
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
export function detectSelfReview(store, reviewerAgent, taskNumber) {
  try {
    const lifecycle = store.db.prepare("SELECT task_id FROM task_lifecycle WHERE task_number = ?").get(taskNumber);
    if (!lifecycle?.task_id) return { selfReview: false };

    const reportRow = store.db.prepare(
      "SELECT agent_id FROM task_reports WHERE task_id = ? ORDER BY submitted_at DESC LIMIT 1"
    ).get(lifecycle.task_id);
    if (!reportRow?.agent_id) return { selfReview: false };

    const finisherAgent = reportRow.agent_id;

    // True self-review: same agent who finished the task
    if (finisherAgent === reviewerAgent) {
      const reviewerIdentity = getOperatorIdentity(store, reviewerAgent);
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
    const reviewerRow = store.db.prepare("SELECT role, operator_identity FROM agent_roster WHERE agent_id = ?").get(reviewerAgent);
    if (!reviewerRow?.role) return { selfReview: false };

    const peerCount = store.db.prepare(
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
