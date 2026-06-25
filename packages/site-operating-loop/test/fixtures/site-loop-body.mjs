export function createSiteOperatingLoopSteps({ cycleIndex, trigger }) {
  return [
    {
      stepId: 'observe-trigger',
      execute: () => ({
        cycle_index: cycleIndex,
        trigger_id: trigger?.trigger_id ?? null,
        trigger_kind: trigger?.kind ?? 'cadence',
        source_ref: trigger?.source_ref ?? null,
      }),
    },
    {
      stepId: 'decide-dispatch',
      inputRefs: () => trigger ? [`trigger:${trigger.trigger_id}`] : [],
      outputRefs: () => trigger ? [`decision:${trigger.trigger_id}`] : ['decision:cadence-noop'],
      execute: () => ({
        decision: trigger ? 'dispatch_admitted' : 'noop',
        emission_kind: trigger ? 'directive_candidate' : null,
      }),
    },
  ];
}

export function summarizeSiteOperatingLoopRun({ steps, trigger }) {
  return {
    step_count: steps.length,
    trigger_id: trigger?.trigger_id ?? null,
    decision: steps.find((step) => step.step_id === 'decide-dispatch')?.evidence?.decision ?? null,
  };
}
