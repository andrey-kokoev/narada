export function deriveClosureAuthority(lifecycle: any) : any {
  const closedAt: any = lifecycle?.closed_at ?? null;
  const closedBy: any = lifecycle?.closed_by ?? null;
  const hasClosureEvidence: any = Boolean(closedAt && closedBy);
  if (!hasClosureEvidence) {
    return {
      status: 'no_closure_evidence',
      closure_dominates: false,
      has_closure_evidence: false,
    };
  }

  const reopenedAfterClosure: any = isAfter(lifecycle?.reopened_at, closedAt);
  const continuationAfterClosure: any = hasContinuationAfterClosure(lifecycle?.continuation_packet_json, closedAt);
  const traceableReopenOrContinue: any = reopenedAfterClosure || continuationAfterClosure;
  const contradictoryStatus: any = lifecycle?.status !== 'closed' && !traceableReopenOrContinue;

  return {
    status: contradictoryStatus ? 'closure_evidence_conflicts_with_lifecycle_status' : 'closure_evidence_consistent',
    closure_dominates: contradictoryStatus,
    has_closure_evidence: true,
    contradictory_status: contradictoryStatus,
    reason: contradictoryStatus
      ? `Task has authoritative closure evidence (${closedAt} by ${closedBy}) with status '${lifecycle?.status}' and no later reopen/continue trace.`
      : 'Closure evidence is closed or superseded by a later reopen/continue trace.',
    closed_at: closedAt,
    closed_by: closedBy,
    reopened_at: lifecycle?.reopened_at ?? null,
    reopened_by: lifecycle?.reopened_by ?? null,
    reopened_after_closure: reopenedAfterClosure,
    continuation_after_closure: continuationAfterClosure,
  };
}

function isAfter(candidate: any, baseline: any) : any {
  if (!candidate || !baseline) return false;
  const candidateMs: any = Date.parse(candidate);
  const baselineMs: any = Date.parse(baseline);
  return Number.isFinite(candidateMs) && Number.isFinite(baselineMs) && candidateMs > baselineMs;
}

function hasContinuationAfterClosure(packetJson: any, closedAt: any) : any {
  if (!packetJson || !closedAt) return false;
  let packet: any;
  try {
    packet = JSON.parse(packetJson);
  } catch {
    return false;
  }
  const timestamps: any = [];
  collectIsoLikeValues(packet, timestamps);
  return timestamps.some((value: any)  => isAfter(value, closedAt));
}

function collectIsoLikeValues(value: any, out: any) : any {
  if (!value) return;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectIsoLikeValues(item, out);
    return;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectIsoLikeValues(item, out);
  }
}
