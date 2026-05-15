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
    expect(contract.field_contract.startup_command.required_shape.name).toBe('agent_context_hydrate_current');
    expect(contract.field_contract.required_environment.required_keys).toContain('NARADA_AGENT_ID');
    expect(contract.field_contract.required_environment.required_keys).toContain('NARADA_CARRIER_SESSION_ID');
    expect(contract.field_contract.native_execution_policy.rule).toContain('Native shell/script access and policy-aware Narada shell MCP are separate capabilities');
    expect(contract.field_contract.tool_approval_policy.rule).toContain('policy-aware shell MCP');
    expect(contract.anti_collapse_rules).toContain('launch_packet_is_evidence_not_activation_authority');
    expect(contract.anti_collapse_rules).toContain('native_shell_access_is_not_policy_aware_shell_mcp');
    expect(contract.locus_responsibilities.narada_proper).toContain('launch_packet_contract');
    expect(contract.locus_responsibilities.pc_site).toContain('process_and_window_truth');
  });
});
