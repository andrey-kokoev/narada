/**
 * synthesize-bootstrap.ts
 *
 * Fold agent_events into a bootstrap residue (L1 layer).
 */

type AnyRecord = Record<string, any>;

export function synthesizeBootstrap(db: AnyRecord | null, agentId: string, options: AnyRecord = {}): AnyRecord {
  const limit = options.limit ?? 10;

  if (!db) {
    return {
      schema: 'narada.bootstrap.l1.v0',
      agent_id: agentId,
      checkpoint_count: 0,
      checkpoints: [],
      summary: 'No agent context DB available; bootstrap is cold.',
    };
  }

  const hasTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_events'",
  ).get();

  if (!hasTable) {
    return {
      schema: 'narada.bootstrap.l1.v0',
      agent_id: agentId,
      checkpoint_count: 0,
      checkpoints: [],
      summary: 'Agent event log not yet initialized; bootstrap is cold.',
    };
  }

  const rows = db.prepare(
    `SELECT event_id, event_type, task_number, payload_json, emitted_at
     FROM agent_events
     WHERE agent_id = ? AND event_type = 'checkpoint'
     ORDER BY emitted_at DESC
     LIMIT ?`,
  ).all(agentId, limit) as AnyRecord[];

  const checkpoints = rows.map((row: AnyRecord) => {
    let payload: AnyRecord | null = null;
    try {
      if (row.payload_json) payload = JSON.parse(row.payload_json) as AnyRecord;
    } catch {
      payload = { parse_error: true, raw: row.payload_json };
    }
    return {
      event_id: row.event_id,
      task_number: row.task_number,
      emitted_at: row.emitted_at,
      boundary_type: payload?.boundary_type ?? 'unknown',
      decisions: payload?.decisions ?? [],
      files_changed: payload?.files_changed ?? [],
      tests_run: payload?.tests_run ?? [],
      friction: payload?.friction ?? [],
    };
  });

  const summary = buildSummary(checkpoints);

  return {
    schema: 'narada.bootstrap.l1.v0',
    agent_id: agentId,
    checkpoint_count: checkpoints.length,
    checkpoints,
    summary,
  };
}

function buildSummary(checkpoints: AnyRecord[]): string {
  if (checkpoints.length === 0) {
    return 'No prior checkpoints found. Starting fresh session.';
  }

  const parts: string[] = [];
  parts.push(`Found ${checkpoints.length} recent checkpoint(s).`);

  const recentTasks = checkpoints
    .filter((checkpoint: AnyRecord) => checkpoint.task_number)
    .map((checkpoint: AnyRecord) => `Task ${checkpoint.task_number} (${checkpoint.boundary_type})`);
  if (recentTasks.length > 0) {
    parts.push(`Recent work: ${recentTasks.join(', ')}.`);
  }

  const allFiles = checkpoints.flatMap((checkpoint: AnyRecord) => checkpoint.files_changed ?? []) as string[];
  const uniqueFiles = [...new Set(allFiles)].slice(0, 10);
  if (uniqueFiles.length > 0) {
    parts.push(`Files touched: ${uniqueFiles.join(', ')}.`);
  }

  const allDecisions = checkpoints.flatMap((checkpoint: AnyRecord) => checkpoint.decisions ?? []) as AnyRecord[];
  if (allDecisions.length > 0) {
    const recentDecisions = allDecisions.slice(0, 3);
    parts.push(`Key decisions: ${recentDecisions.map((decision: AnyRecord) => decision.what).join('; ')}.`);
  }

  const allFriction = checkpoints.flatMap((checkpoint: AnyRecord) => checkpoint.friction ?? []) as AnyRecord[];
  const highFriction = allFriction.filter((friction: AnyRecord) => (friction.severity ?? 0) >= 7);
  if (highFriction.length > 0) {
    parts.push(`Outstanding friction: ${highFriction.map((friction: AnyRecord) => friction.what).join('; ')}.`);
  }

  return parts.join(' ');
}
