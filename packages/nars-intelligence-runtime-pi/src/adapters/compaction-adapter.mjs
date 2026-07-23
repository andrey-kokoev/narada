/** Pi compaction is evidence; it never deletes NARS canonical history. */
export function createCompactionAdapter({ eventSink = async () => {}, now = () => new Date().toISOString() } = {}) {
  let state = 'idle';
  return Object.freeze({
    state: () => state,
    async observe(candidate = {}, context = {}) {
      state = 'candidate';
      const evidence = {
        kind: 'pi_compaction_evidence',
        schema: 'narada.nars.pi.compaction.evidence.v1',
        turn_id: context.turn_id ?? null,
        retained_context_cursor: candidate.retained_context_cursor ?? null,
        summary_digest: candidate.summary_digest ?? null,
        token_estimate: candidate.token_estimate ?? null,
        canonical_history_deleted: false,
        accepted_by_nars: false,
        timestamp: now(),
      };
      await eventSink(evidence);
      state = 'idle';
      return evidence;
    },
    reset() { state = 'idle'; },
  });
}

