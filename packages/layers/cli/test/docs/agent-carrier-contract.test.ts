import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('node:fs');

const root = join(process.cwd(), '..', '..', '..');

describe('agent carrier concept and launch packet contract', () => {
  it('keeps Agent Carrier distinct from agent identity, session, substrate, and surfaces', () => {
    const concept = readFileSync(join(root, 'docs/concepts/agent-carrier.md'), 'utf8');
    const operatorSurface = readFileSync(join(root, 'docs/concepts/operator-surface.md'), 'utf8');
    const doctrineIndex = readFileSync(join(root, 'AGENTS.md'), 'utf8');

    expect(concept).toContain('An **Agent Carrier** is the governed runtime harness');
    expect(concept).toContain('A carrier is not an Agent.');
    expect(concept).toContain('A substrate is not an Agent.');
    expect(concept).toContain('An Operator Surface is not a carrier.');
    expect(concept).toContain('Narada proper | Carrier concept, launch packet contract, package API');
    expect(concept).toContain('User Site | Local adoption preferences');
    expect(concept).toContain('PC Site | Host/runtime facts');
    expect(operatorSurface).toContain('AgentCarrier embodies one Agent in one Session.');
    expect(doctrineIndex).toContain('agent-carrier.md');
  });

  it('defines a carrier launch packet contract across Codex, Claude Code, Kimi, and Narada-native carriers', () => {
    const contract = JSON.parse(readFileSync(join(root, 'docs/product/agent-carrier-launch-packet.v0.json'), 'utf8'));

    expect(contract.schema).toBe('narada.agent_carrier.launch_packet_contract.v0');
    expect(contract.concept_ref).toBe('docs/concepts/agent-carrier.md');
    expect(contract.carrier_kinds.map((carrier: { kind: string }) => carrier.kind)).toEqual([
      'codex_carrier',
      'claude_code_carrier',
      'kimi_carrier',
      'narada_native_carrier',
      'api_agent_carrier',
    ]);
    for (const required of [
      'agent_id',
      'carrier_session_id',
      'agent_start_event_id',
      'startup_command',
      'required_environment',
      'tool_approval_policy',
      'native_execution_policy',
      'launch_result_path',
      'result_sentinel',
      'not_claimed',
    ]) {
      expect(contract.required_fields).toContain(required);
    }
    expect(contract.field_contract.startup_command.required_shape.name).toBe('agent_context_startup_sequence');
    expect(contract.optional_fields).toContain('startup_sequence');
    expect(contract.field_contract.startup_sequence.required_first_steps[0].tool).toBe('agent_context_hydrate_current');
    expect(contract.field_contract.startup_sequence.required_first_steps[1].tool).toBe('agent_context_memory.plan_hydration');
    expect(contract.field_contract.startup_sequence.required_first_steps[1].arguments.named_agent_id.field).toBe('agent_id');
    expect(contract.field_contract.startup_sequence.required_first_steps[1].optional_next.tool).toBe('agent_context_memory.read_checkpoint_summary');
    expect(contract.field_contract.startup_sequence.required_first_steps[1].optional_next.arguments.checkpoint_id.field).toBe('selectedCheckpoint.checkpointId');
    expect(contract.field_contract.startup_sequence.rule).toContain('explicit advisory phase');
    expect(contract.field_contract.required_environment.required_keys).toContain('NARADA_AGENT_ID');
    expect(contract.field_contract.required_environment.required_keys).toContain('NARADA_CARRIER_SESSION_ID');
    expect(contract.field_contract.native_execution_policy.rule).toContain('Native shell/script access and policy-aware Narada shell MCP are separate capabilities');
    expect(contract.field_contract.tool_approval_policy.rule).toContain('policy-aware shell MCP');
    expect(contract.anti_collapse_rules).toContain('launch_packet_is_evidence_not_activation_authority');
    expect(contract.anti_collapse_rules).toContain('native_shell_access_is_not_policy_aware_shell_mcp');
    expect(contract.locus_responsibilities.narada_proper).toContain('launch_packet_contract');
    expect(contract.locus_responsibilities.pc_site).toContain('process_and_window_truth');
  });

  it('defines the Narada-native carrier runtime boundary without authority ownership', () => {
    const boundary = JSON.parse(readFileSync(join(root, 'docs/product/narada-native-carrier-runtime-boundary.v0.json'), 'utf8'));

    expect(boundary.schema).toBe('narada.narada_native_carrier.runtime_boundary.v0');
    expect(boundary.runtime_harness.inputs).toEqual(expect.arrayContaining([
      'agent_id',
      'agent_start_event_id',
      'carrier_session_id',
      'startup_command',
      'model_adapter_ref',
      'executor_adapter_ref',
    ]));
    expect(boundary.runtime_harness.evidence_records).toContain('native_carrier_lifecycle_event');
    expect(boundary.lifecycle_states.map((entry: { state: string }) => entry.state)).toEqual([
      'planned',
      'materialized',
      'running',
      'stopped',
      'refused',
    ]);
    expect(boundary.canonical_authority_owners).toMatchObject({
      task_lifecycle: 'task_governance_service',
      inbox: 'canonical_inbox_service',
      outbox: 'canonical_outbox_service',
      command_execution: 'command_execution_intent_service',
      repository_publication: 'repository_publication_intent_service',
      law: 'law_receipt_service',
      roster: 'agent_roster_service',
      capability_consent: 'canonical_capability_consent_registry',
    });
    expect(boundary.adapter_boundary.model_adapter.authority_owner).toBe('none');
    expect(boundary.adapter_boundary.executor_adapter.authority_owner).toBe('none');
    expect(boundary.adapter_boundary.executor_adapter.must_not_execute_without).toContain('canonical command execution intent admission');
    expect(boundary.readback_vocabulary.direct_sqlite_inspection_required).toBe(false);
    expect(boundary.authority_non_ownership_assertions).toContain('model_adapter_is_not_authority_owner');
    expect(boundary.authority_non_ownership_assertions).toContain('capability_projection_is_not_capability_consent');
  });
});
