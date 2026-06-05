import { latestSessionReadback } from './claude-code-lifecycle.mjs';

function buildAffordance({ siteRoot, launchResult = null }) {
  const latest = latestSessionReadback(siteRoot);
  const carrierSessionId = launchResult?.carrier_session_id ?? latest.carrier_session_id;
  const startupCommand = launchResult?.startup_command ?? {
    name: 'agent_context_startup_sequence',
    arguments: {},
  };
  return {
    schema: 'narada.agent_start.claude_code_operator_affordance.v0',
    carrier_kind: 'claude_code_carrier',
    carrier_session_id: carrierSessionId,
    startup_command: startupCommand,
    result_sentinel: launchResult?.result_sentinel ?? null,
    mcp_approval_posture: launchResult?.mcp_tool_approval ?? null,
    latest_session_readback: latest,
    resumability: {
      state: latest.current_state === 'interrupted' || latest.current_state === 'handoff_requested'
        ? 'resumable_from_evidence'
        : 'inspect_latest_evidence',
      depends_on_volatile_terminal_or_window_state: false,
    },
    requests: {
      launch: {
        kind: 'launch_request',
        command: 'node --import tsx packages\\agent-start\\src\\narada-agent-start.ts narada.builder --site-root D:\\code\\narada --target-site-root D:\\code\\narada --runtime claude-code --exec --dry-run --json',
        authority: 'operator_confirms_process_launch',
      },
      resume: {
        kind: 'resume_request',
        carrier_session_id: carrierSessionId,
        authority: 'operator_confirms_resume_from_carrier_session_evidence',
      },
      interrupt: {
        kind: 'interrupt_request',
        carrier_session_id: carrierSessionId,
        authority: 'operator_or_runtime_locus_confirms_interrupt',
      },
      handoff: {
        kind: 'handoff_request',
        carrier_session_id: carrierSessionId,
        authority: 'canonical_task_or_inbox_handoff_required',
      },
      close: {
        kind: 'close_request',
        carrier_session_id: carrierSessionId,
        authority: 'closeout_evidence_required',
      },
    },
    next_operator_action: carrierSessionId
      ? 'Inspect latest_session_readback and choose resume, handoff, interrupt, or close request.'
      : 'Run launch request dry-run and inspect the launch packet before process execution.',
    authority_non_claims: [
      'task_activation_authority',
      'inbox_authority',
      'outbox_authority',
      'repository_publication_authority',
      'credential_access',
      'volatile_terminal_window_truth',
    ],
  };
}

export { buildAffordance };
