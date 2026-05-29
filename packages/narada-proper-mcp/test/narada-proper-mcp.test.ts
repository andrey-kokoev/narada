import { describe, expect, it } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildNaradaProperArchitectRolePolicyProjection,
  parseNaradaProperMcpArgs,
  runNaradaProperMcp,
  NARADA_PROPER_MCP_SURFACE,
  NARADA_PROPER_EXECUTION_SURFACE_CONTRACTS,
  LEGACY_CLI_MCP_FACADE_POSTURE,
  NARADA_PROPER_MCP_SURFACE_REGISTRY,
  buildAdvisoryLiftPacket,
  boundedMcpOutput,
  generateCarrierMcpConfig,
  observeSiteIdentity,
  planReadOnlySiteProbe,
  readMcpOutputRef,
  readMcpPayloadRef,
  reconcileLocalMcpRolePolicy,
  validateNaradaProperArchitectAllowedTools,
  validateExecutionSurfaceContracts,
  validateNaradaProperMcpSurfaceRegistry,
  writeMcpPayloadRef,
} from '../src/index.js';
import { localNaradaCliEnvironment, localNaradaCliInvocation } from '../src/commands/process.js';
import { handleMcpRequest, NARADA_MCP_TOOLS, resolveMcpSiteContext } from '../src/server.js';

describe('narada proper MCP surface', () => {
  it('parses target-local startup identity arguments', () => {
    expect(parseNaradaProperMcpArgs([
      '--site-root', 'D:/code/narada',
      '--site-id', 'narada-proper',
      '--agent-id', 'narada.architect',
      '--agent-role', 'architect',
      '--agent-start-event-id', 'agent_start_test',
      '--carrier-session-id', 'carrier_session_test',
      '--agent-context-db', 'D:/code/narada/.ai/state/agent-context.sqlite',
    ])).toEqual({
      siteRoot: 'D:/code/narada',
      siteId: 'narada-proper',
      agentId: 'narada.architect',
      agentRole: 'architect',
      agentStartEventId: 'agent_start_test',
      carrierSessionId: 'carrier_session_test',
      agentContextDb: 'D:/code/narada/.ai/state/agent-context.sqlite',
    });
  });

  it('declares the old narada-mcp facade as replaced compatibility', () => {
    expect(NARADA_PROPER_MCP_SURFACE).toMatchObject({
      surface_id: 'narada-proper.surface.agent-facing-mcp.v1',
      package_name: '@narada2/narada-proper-mcp',
      compatibility_facade_replaced: 'narada-mcp',
      source_site_runtime_imported: false,
    });
  });

  it('validates the target-local MCP surface registry contract', () => {
    const errors = validateNaradaProperMcpSurfaceRegistry();
    const proper = NARADA_PROPER_MCP_SURFACE_REGISTRY.find((record) => record.package_name === '@narada2/narada-proper-mcp');
    const exposed = new Set(NARADA_MCP_TOOLS.map((tool) => tool.name));

    expect(errors).toEqual([]);
    expect(proper).toBeDefined();
    expect(proper?.runtime_binding.generated_client_config_posture).toBe('transport_wiring_only');
    expect(proper?.authority_boundary.imports_source_runtime_authority).toBe(false);
    expect(proper?.provenance.source_refs).toContain('C:/Users/Andrey/Narada');
    expect(proper?.provenance.source_refs_are_authority).toBe(false);
    for (const tool of [...(proper?.tool_contract.read_only_tools ?? []), ...(proper?.tool_contract.mutating_tools ?? [])]) {
      expect(exposed.has(tool)).toBe(true);
    }
  });

  it('defines an inert architect role-policy projection from the MCP surface registry', () => {
    const projection = buildNaradaProperArchitectRolePolicyProjection();

    expect(projection).toMatchObject({
      schema: 'narada.mcp_role_policy_projection.v0',
      role: 'architect',
      server: 'narada-proper',
      policy_source: {
        kind: 'mcp_surface_registry',
        package_name: '@narada2/narada-proper-mcp',
      },
      reconciled_runtime_posture: {
        config_path: 'config.json',
        config_json_is_authority: false,
        config_json_role: 'site_local_runtime_posture',
        reconciliation_required_for_runtime: true,
      },
    });
    expect(projection.tool_policy.canonical_allowed_tools).toContain('agent_context_startup_sequence');
    expect(projection.tool_policy.canonical_allowed_tools).toContain('narada_task_read');
    expect(projection.tool_policy.canonical_allowed_tools).not.toContain('inbox_submit_observation');
    expect(projection.tool_policy.optional_alias_tools).toEqual([
      'inbox_stage_submission_workflow',
      'inbox_submit_observation',
      'inbox_submit_typed_envelope',
    ]);
    expect(projection.tool_policy.refused_tools).toContain('narada_ee_run');
    expect(validateNaradaProperArchitectAllowedTools(projection.tool_policy.canonical_allowed_tools, projection)).toMatchObject({
      status: 'valid',
      errors: [],
    });
  });

  it('rejects missing, stale, alias, and refused architect role-policy tools', () => {
    const projection = buildNaradaProperArchitectRolePolicyProjection();
    const [removed, ...rest] = projection.tool_policy.canonical_allowed_tools;
    const result = validateNaradaProperArchitectAllowedTools([
      ...rest,
      'site_task_lifecycle.open_admitted_task',
      'inbox_submit_observation',
      'narada_ee_run',
    ], projection);

    expect(result).toMatchObject({
      status: 'invalid',
      missing_tools: [removed],
      stale_tools: ['site_task_lifecycle.open_admitted_task'],
      alias_tools: ['inbox_submit_observation'],
      refused_tools: ['narada_ee_run'],
    });
    expect(result.errors).toEqual([
      `missing_canonical_tool:${removed}`,
      'stale_or_unknown_tool:site_task_lifecycle.open_admitted_task',
      'alias_tool_requires_explicit_admission:inbox_submit_observation',
      'refused_tool_configured:narada_ee_run',
    ]);
  });

  it('admits optional aliases only when explicitly projected', () => {
    const projection = buildNaradaProperArchitectRolePolicyProjection({ include_alias_tools: true });

    expect(projection.tool_policy.canonical_allowed_tools).toContain('inbox_submit_observation');
    expect(validateNaradaProperArchitectAllowedTools(projection.tool_policy.canonical_allowed_tools, projection)).toMatchObject({
      status: 'valid',
      alias_tools: [],
    });
  });

  it('reports no local config MCP policy drift in read-only mode', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-policy-ok-'));
    try {
      const projection = buildNaradaProperArchitectRolePolicyProjection();
      writePolicyConfig(siteRoot, projection.tool_policy.canonical_allowed_tools, { unrelated: { kept: true } });

      const result = reconcileLocalMcpRolePolicy({ siteRoot });

      expect(result).toMatchObject({
        status: 'ok',
        mode: 'check',
        exit_code: 0,
        mutation_attempted: false,
        mutation_performed: false,
        additions: [],
        removals: [],
        evidence_path: null,
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('reports exact local config MCP policy additions and removals without mutating', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-policy-drift-'));
    try {
      const projection = buildNaradaProperArchitectRolePolicyProjection();
      const [missing, ...rest] = projection.tool_policy.canonical_allowed_tools;
      writePolicyConfig(siteRoot, [...rest, 'site_task_lifecycle.open_admitted_task']);
      const before = readFileSync(join(siteRoot, 'config.json'), 'utf8');

      const result = reconcileLocalMcpRolePolicy({ siteRoot, projection });

      expect(result).toMatchObject({
        status: 'drift',
        mode: 'check',
        exit_code: 1,
        mutation_performed: false,
        additions: [missing],
        removals: ['site_task_lifecycle.open_admitted_task'],
      });
      expect(readFileSync(join(siteRoot, 'config.json'), 'utf8')).toBe(before);
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('reports malformed local config MCP policy without repair mutation', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-policy-bad-'));
    try {
      writeFileSync(join(siteRoot, 'config.json'), '{not-json\n');

      expect(reconcileLocalMcpRolePolicy({ siteRoot })).toMatchObject({
        status: 'error',
        exit_code: 2,
        error: 'config_json_malformed',
        mutation_performed: false,
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('repairs only the local config allowed_tools subtree and records evidence', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-policy-apply-'));
    try {
      const projection = buildNaradaProperArchitectRolePolicyProjection();
      const [missing, ...rest] = projection.tool_policy.canonical_allowed_tools;
      const unrelated = { kept: true, nested: { value: 7 } };
      writePolicyConfig(siteRoot, [...rest, 'site_task_lifecycle.open_admitted_task'], { unrelated });

      const result = reconcileLocalMcpRolePolicy({ siteRoot, projection, apply: true, by: 'narada.builder' });
      const config = JSON.parse(readFileSync(join(siteRoot, 'config.json'), 'utf8'));

      expect(result).toMatchObject({
        status: 'repaired',
        mode: 'apply',
        exit_code: 0,
        mutation_attempted: true,
        mutation_performed: true,
        additions: [missing],
        removals: ['site_task_lifecycle.open_admitted_task'],
      });
      expect(config.unrelated).toEqual(unrelated);
      expect(config.mcp.role_policies.architect.servers['narada-proper'].allowed_tools)
        .toEqual(projection.tool_policy.canonical_allowed_tools);
      expect(result.evidence_path).toContain(join(siteRoot, '.ai', 'mutation-evidence', 'mcp_policy'));
      const evidence = JSON.parse(readFileSync(result.evidence_path ?? '', 'utf8'));
      expect(evidence).toMatchObject({
        schema: 'narada.local_mcp_policy_repair_evidence.v0',
        mutation_scope: 'allowed_tools_subtree_only',
        mutation_performed: true,
        by: 'narada.builder',
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('exposes read-only agent context doctrinal grounding for telemetry ownership questions', async () => {
    const toolNames = NARADA_MCP_TOOLS.map((tool) => tool.name);
    expect(toolNames).toContain('agent_context_doctrinal_grounding');
    expect(toolNames).not.toContain('narada_doctrine_grounding_refs');

    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'agent_context_doctrinal_grounding',
        arguments: {
          mode: 'reground',
          question: 'Who owns hosted telemetry monitoring and secret rotation?',
        },
      },
    }, { siteRoot: 'D:/code/narada', siteId: 'narada-proper' });

    const text = (((response?.result as { content: Array<{ text: string }> }).content[0]).text);
    const result = JSON.parse(text);
    expect(result).toMatchObject({
      status: 'success',
      schema: 'narada.agent_context.doctrinal_grounding.v0',
      mode: 'reground',
      mutation_attempted: false,
      private_inquiry_space_data_imported: false,
      raw_private_data_recorded: false,
      posture_summary: {
        target_locus_required_before_mutation: true,
      },
    });
    expect(result.doctrine_catalog.map((ref: { ref: string }) => ref.ref)).toContain('docs/product/site-telemetry-operations-posture.v0.md');
    expect(result.ccc_coordinates.canonical_inbox).toContain('typed inert envelopes');
    expect(result.ias_mapping.separation_rule).toContain('does not itself admit');
    expect(result.review_protocol.task_closure).toContain('governed task');
    expect(result.proof_case.answer_posture).toContain('owning Site governs surface policy');
  });

  it('exposes first-class directive create, list, and render tools', async () => {
    mkdirSync(resolve('.ai', 'tmp'), { recursive: true });
    const siteRoot = mkdtempSync(resolve('.ai', 'tmp', 'narada-mcp-directives-'));
    try {
      const create = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'narada_directive_create',
          arguments: {
            source_kind: 'operator',
            source_id: 'operator:andrey',
            authority_locus: 'operator',
            authority_basis: 'manual_directive',
            target_kind: 'agent',
            target_id: 'narada.architect',
            content_kind: 'instruction',
            text: 'Implement first-class directives.',
            priority: 10,
            sequence: 1,
          },
        },
      }, { siteRoot, siteId: 'narada-proper', agentId: 'narada.architect' });
      const created = JSON.parse(((create?.result as { content: Array<{ text: string }> }).content[0]).text);

      expect(created).toMatchObject({
        status: 'success',
        schema: 'narada.directive.mcp_create_result.v1',
        taskCreated: false,
        executableAuthorityGranted: false,
      });
      expect(created.directive.directive_id).toMatch(/^dir_/);
      expect(created.directive.admission.status).toBe('admitted');

      const render = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'narada_directive_render_context',
          arguments: {
            target_kind: 'agent',
            target_id: 'narada.architect',
          },
        },
      }, { siteRoot, siteId: 'narada-proper' });
      const rendered = JSON.parse(((render?.result as { content: Array<{ text: string }> }).content[0]).text);

      expect(rendered).toMatchObject({
        status: 'success',
        schema: 'narada.directive.mcp_render_context_result.v1',
        directiveCount: 1,
      });
      expect(rendered.rendered).toContain('Implement first-class directives.');

      const list = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'narada_directive_list',
          arguments: { active_only: true },
        },
      }, { siteRoot, siteId: 'narada-proper' });
      const listed = JSON.parse(((list?.result as { content: Array<{ text: string }> }).content[0]).text);
      expect(listed.directives).toHaveLength(1);
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('records operator authorization for system-emitted directives', async () => {
    mkdirSync(resolve('.ai', 'tmp'), { recursive: true });
    const siteRoot = mkdtempSync(resolve('.ai', 'tmp', 'narada-mcp-system-directives-'));
    try {
      const create = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'narada_directive_create',
          arguments: {
            source_kind: 'system',
            source_id: 'narada-proper.system.directive_emitter',
            authority_locus: 'narada_proper',
            authority_basis: 'interactive_operator_request',
            emission_authorized_by_kind: 'operator',
            emission_authorized_by_id: 'operator.andrey',
            emission_authority_basis: 'operator_requested_system_directive',
            target_kind: 'role',
            target_id: 'architect',
            content_kind: 'instruction',
            text: 'Always include active first-class directives in startup context.',
          },
        },
      }, { siteRoot, siteId: 'narada-proper', agentId: 'narada.architect' });
      const created = JSON.parse(((create?.result as { content: Array<{ text: string }> }).content[0]).text);

      expect(created.emissionAuthorization).toMatchObject({
        schema: 'narada.directive-emission-authorization.v1',
        authorized_by: { kind: 'operator', id: 'operator.andrey' },
        authorized_emitter: { kind: 'system', id: 'narada-proper.system.directive_emitter' },
        authority: { locus: 'narada_proper', basis: 'operator_requested_system_directive' },
        status: 'authorized',
      });
      expect(created.emissionAuthorization.authorization_id).toMatch(/^auth_/);
      expect(created.directive.authority.basis).toBe(`directive_emission_authorization:${created.emissionAuthorization.authorization_id}`);
      const eventLog = readFileSync(created.directiveEventLogPath, 'utf8');
      expect(eventLog).toContain('directive.emission_authorized');
      expect(eventLog).toContain(created.emissionAuthorization.authorization_id);
      const authorizationStore = JSON.parse(readFileSync(created.directiveEmissionAuthorizationStorePath, 'utf8'));
      expect(authorizationStore.authorizations).toHaveLength(1);
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('exposes explicit operator-authorized system directive emission tool', async () => {
    mkdirSync(resolve('.ai', 'tmp'), { recursive: true });
    const siteRoot = mkdtempSync(resolve('.ai', 'tmp', 'narada-mcp-system-emission-tool-'));
    try {
      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'narada_directive_record_operator_authorized_system_emission',
          arguments: {
            operator_id: 'operator.andrey',
            system_emitter_id: 'narada-proper.system.directive_emitter',
            authority_locus: 'narada_proper',
            authorization_basis: 'operator_requested_system_directive',
            target_kind: 'role',
            target_id: 'architect',
            content_kind: 'instruction',
            text: 'Always include active first-class directives in startup context.',
          },
        },
      }, { siteRoot, siteId: 'narada-proper', agentId: 'narada.architect' });
      const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0]).text);

      expect(result.schema).toBe('narada.directive.mcp_create_result.v1');
      expect(result.emissionAuthorization.authorization_id).toMatch(/^auth_/);
      expect(result.directive.source).toMatchObject({
        kind: 'system',
        id: 'narada-proper.system.directive_emitter',
      });
      expect(result.directive.authority.basis).toBe(`directive_emission_authorization:${result.emissionAuthorization.authorization_id}`);
      expect(result.toolSemantics).toMatchObject({
        operatorAuthorizationRecorded: true,
        systemDirectiveEmitted: true,
        emissionTimeSemantics: 'immediate',
        executionAttempted: false,
        deliveryAttempted: false,
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('normalizes model-shaped system directive emission arguments', async () => {
    mkdirSync(resolve('.ai', 'tmp'), { recursive: true });
    const siteRoot = mkdtempSync(resolve('.ai', 'tmp', 'narada-mcp-system-emission-normalized-'));
    try {
      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'narada_directive_record_operator_authorized_system_emission',
          arguments: {
            operator_id: 'operator.andrey',
            system_emitter: 'narada-proper.system.directive_emitter',
            authority_locus: 'narada_proper',
            authorization_basis: 'operator_requested_system_directive',
            target: { kind: 'role', id: 'architect' },
            content_kind: 'instruction',
            directive_text: 'Always include active first-class directives in startup context.',
          },
        },
      }, { siteRoot, siteId: 'narada-proper', agentId: 'narada.architect' });
      const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0]).text);

      expect(result.status).toBe('success');
      expect(result.directive.target).toEqual({ kind: 'role', id: 'architect' });
      expect(result.directive.source.id).toBe('narada-proper.system.directive_emitter');
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('normalizes terse role and system_directive aliases for system directive emission', async () => {
    mkdirSync(resolve('.ai', 'tmp'), { recursive: true });
    const siteRoot = mkdtempSync(resolve('.ai', 'tmp', 'narada-mcp-system-emission-terse-'));
    try {
      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'narada_directive_record_operator_authorized_system_emission',
          arguments: {
            role: 'architect',
            content_kind: 'system_directive',
            directive: 'Always include active first-class directives in startup context.',
          },
        },
      }, { siteRoot, siteId: 'narada-proper', agentId: 'narada.architect' });
      const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0]).text);

      expect(result.status).toBe('success');
      expect(result.directive.target).toEqual({ kind: 'role', id: 'architect' });
      expect(result.directive.source.id).toBe('narada-proper.system.directive_emitter');
      expect(result.directive.authority.locus).toBe('narada_proper');
      expect(result.directive.content.kind).toBe('instruction');
      expect(result.emissionAuthorization.authorized_by).toMatchObject({ kind: 'operator', id: 'operator.interactive' });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('refuses non-site-scoped system emitters for system directive emission', async () => {
    mkdirSync(resolve('.ai', 'tmp'), { recursive: true });
    const siteRoot = mkdtempSync(resolve('.ai', 'tmp', 'narada-mcp-system-emission-bad-emitter-'));
    try {
      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'narada_directive_record_operator_authorized_system_emission',
          arguments: {
            role: 'architect',
            system_emitter_id: 'narada.architect',
            directive: 'Always include active first-class directives in startup context.',
          },
        },
      }, { siteRoot, siteId: 'narada-proper', agentId: 'narada.architect' });

      expect(response?.error?.message).toContain('Invalid system_emitter_id');
      expect(response?.error?.message).toContain('narada-proper.system.directive_emitter');
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('filters agent context doctrinal grounding by doctrine ids', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'agent_context_doctrinal_grounding',
        arguments: {
          mode: 'reground',
          doctrine_ids: ['docs_concepts_canonical_inbox'],
        },
      },
    }, { siteRoot: 'D:/code/narada', siteId: 'narada-proper' });

    const text = (((response?.result as { content: Array<{ text: string }> }).content[0]).text);
    const result = JSON.parse(text);
    expect(result.status).toBe('success');
    expect(result.doctrine_catalog).toHaveLength(1);
    expect(result.doctrine_catalog[0]).toMatchObject({
      doctrine_id: 'docs_concepts_canonical_inbox',
      ref: 'docs/concepts/canonical-inbox.md',
    });
  });

  it('uses the external thoughts concept corpus for agent context doctrinal grounding when available', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-doctrine-site-'));
    const corpusParent = join(tmpdir(), `narada-mcp-thoughts-${Date.now()}`);
    const corpusRoot = join(corpusParent, 'content', 'concepts');
    try {
      mkdirSync(corpusRoot, { recursive: true });
      writeFileSync(join(corpusRoot, 'index.md'), [
        '# Concepts',
        '- [Intelligence-Authority Separation](/concepts/intelligence-authority-separation)',
        '- [Governed Crossing](/concepts/governed-crossing)',
      ].join('\n'));
      writeFileSync(join(corpusRoot, 'intelligence-authority-separation.md'), [
        '---',
        'title: "Intelligence-Authority Separation"',
        'description: "Keeps judgment separate from governed consequence."',
        '---',
        '# Intelligence-Authority Separation',
      ].join('\n'));

      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'agent_context_doctrinal_grounding',
          arguments: {
            mode: 'reground',
            doctrine_ids: ['intelligence_authority_separation'],
          },
        },
      }, { siteRoot, siteId: 'narada-proper', doctrineCorpusRoot: corpusRoot });

      const text = (((response?.result as { content: Array<{ text: string }> }).content[0]).text);
      const result = JSON.parse(text);
      expect(result.status).toBe('success');
      expect(result.doctrine_source).toMatchObject({
        primary_corpus: corpusRoot,
        primary_corpus_kind: 'external_thoughts_concepts',
        primary_corpus_available: true,
        primary_corpus_ref_authority: false,
      });
      expect(result.doctrine_source.missing_index_refs).toEqual(['/concepts/governed-crossing']);
      expect(result.doctrine_catalog).toHaveLength(1);
      expect(result.doctrine_catalog[0]).toMatchObject({
        doctrine_id: 'intelligence_authority_separation',
        title: 'Intelligence-Authority Separation',
        reason: 'Keeps judgment separate from governed consequence.',
        source: 'thoughts:content/concepts',
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
      rmSync(corpusParent, { recursive: true, force: true });
    }
  });

  it('blocks doctrine grounding requests that require private Inquiry Space data', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'agent_context_doctrinal_grounding',
        arguments: {
          mode: 'reground',
          question: 'Replay the private inquiry branch for telemetry ownership.',
          require_inquiry_space_data: true,
        },
      },
    }, { siteRoot: 'D:/code/narada', siteId: 'narada-proper' });

    const text = (((response?.result as { content: Array<{ text: string }> }).content[0]).text);
    const result = JSON.parse(text);
    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'private_inquiry_space_data_unavailable_to_narada_proper_mcp',
      mutation_attempted: false,
      private_inquiry_space_data_imported: false,
      raw_private_data_recorded: false,
    });
    expect(result.required_next_step).toContain('Canonical Inbox / Inquiry Space authority');
  });

  it('rejects stale registry tool declarations and authority-importing provenance', () => {
    const [record] = NARADA_PROPER_MCP_SURFACE_REGISTRY;
    const errors = validateNaradaProperMcpSurfaceRegistry([{
      ...record,
      authority_boundary: {
        ...record.authority_boundary,
        imports_source_runtime_authority: true as false,
      },
      provenance: {
        ...record.provenance,
        source_refs_are_authority: true as false,
      },
      tool_contract: {
        ...record.tool_contract,
        read_only_tools: [...record.tool_contract.read_only_tools, 'not_exposed.tool'],
      },
    }]);

    expect(errors).toContain(`${record.surface_id}.not_exposed.tool is not exposed`);
    expect(errors).toContain(`${record.surface_id} imports source runtime authority`);
    expect(errors).toContain(`${record.surface_id} treats provenance as authority`);
  });

  it('stores immutable payload refs with stable hashes and transient authority markers', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-payload-'));
    try {
      const first = writeMcpPayloadRef({ siteRoot }, { z: 1, a: ['b'] });
      const second = writeMcpPayloadRef({ siteRoot }, { a: ['b'], z: 1 });
      const readback = readMcpPayloadRef({ siteRoot }, first.ref);

      expect(first.ref).toBe(second.ref);
      expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(first.transient_transport_not_authority).toBe(true);
      expect(readback).toEqual({ a: ['b'], z: 1 });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('rejects oversized payloads and wrong ref families', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-payload-refusal-'));
    try {
      expect(() => writeMcpPayloadRef({ siteRoot }, { text: 'x'.repeat(20 * 1024) }))
        .toThrow('mcp_payload_inline_size_limit_exceeded');
      const output = boundedMcpOutput({ siteRoot }, { text: 'x'.repeat(100) }, 10);
      expect(output.output_ref).not.toBeNull();
      expect(() => readMcpPayloadRef({ siteRoot }, output.output_ref?.ref ?? ''))
        .toThrow('wrong_ref_family');
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('truncates large MCP outputs with durable readback refs', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-output-'));
    try {
      const result = boundedMcpOutput({ siteRoot }, { rows: Array.from({ length: 50 }, (_, index) => ({ index, value: 'x'.repeat(20) })) }, 100);
      const readback = readMcpOutputRef({ siteRoot }, result.output_ref?.ref ?? '');

      expect(result.inline).toBeNull();
      expect(result.truncated).toBe(true);
      expect(result.output_ref?.ref.startsWith('mcp_output:')).toBe(true);
      expect(result.output_ref?.transient_transport_not_authority).toBe(true);
      expect(readback).toEqual({ rows: Array.from({ length: 50 }, (_, index) => ({ index, value: 'x'.repeat(20) })) });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('defines filesystem test and shell MCP execution contracts as refused until canonical owners are ready', () => {
    const errors = validateExecutionSurfaceContracts();
    const filesystem = NARADA_PROPER_EXECUTION_SURFACE_CONTRACTS.find((record) => record.surface === 'filesystem');
    const test = NARADA_PROPER_EXECUTION_SURFACE_CONTRACTS.find((record) => record.surface === 'test');
    const shell = NARADA_PROPER_EXECUTION_SURFACE_CONTRACTS.find((record) => record.surface === 'shell_ee');

    expect(errors).toEqual([]);
    expect(filesystem).toMatchObject({
      status: 'refused_live_execution',
      authority_boundary: { mcp_surface_is_authority: false },
    });
    expect(filesystem?.admitted_posture).toContain('root_bounded_read_glob_grep_media');
    expect(test?.admitted_posture).toContain('approved_test_registry_required');
    expect(test?.admitted_posture).toContain('source_pass_fail_history_not_imported');
    expect(shell?.authority_boundary.canonical_owner).toBe('command_execution_intent_zone');
    expect(shell?.break_glass).toMatchObject({
      exceptional: true,
      operator_authorized: true,
      scoped: true,
      time_bounded: true,
      audit_required: true,
    });
  });

  it('rejects live execution contracts that make MCP authority or weaken shell break-glass posture', () => {
    const shell = NARADA_PROPER_EXECUTION_SURFACE_CONTRACTS.find((record) => record.surface === 'shell_ee');
    expect(shell).toBeDefined();
    const errors = validateExecutionSurfaceContracts([{
      ...shell!,
      authority_boundary: {
        ...shell!.authority_boundary,
        live_execution_ready: true as false,
        mcp_surface_is_authority: true as false,
      },
      break_glass: {
        ...shell!.break_glass!,
        time_bounded: false as true,
      },
    }]);

    expect(errors).toContain('shell_ee.live_execution_ready must be false until canonical owner is ready');
    expect(errors).toContain('shell_ee.mcp_surface_is_authority must be false');
    expect(errors).toContain('shell_ee break-glass posture must be exceptional, scoped, time-bounded, audited, and operator-authorized');
  });

  it('specifies read-only Site probe planning without target mutation', () => {
    const refused = planReadOnlySiteProbe({ root: 'C:/client/.narada', registered: false });
    const planned = planReadOnlySiteProbe({
      root: 'C:/client/.narada',
      registered: false,
      operator_authority_basis: 'operator_named_target_root',
    });

    expect(refused).toMatchObject({
      status: 'refused',
      refusals: ['unregistered_root_requires_operator_authority_basis'],
      target_mutated: false,
      arbitrary_scan_performed: false,
    });
    expect(planned.status).toBe('planned_descriptor');
    expect(planned.target_mutated).toBe(false);
  });

  it('keeps observed Site identities untrusted until pinned and private keys outside public artifacts', () => {
    const observed = observeSiteIdentity({
      site_id: 'staccato',
      public_identity_document_ref: '.narada/site-identity.json',
    });
    const pinned = observeSiteIdentity({
      site_id: 'staccato',
      public_identity_document_ref: '.narada/site-identity.json',
      trust_pinned: true,
    });

    expect(observed).toMatchObject({
      trust_status: 'untrusted_observed',
      private_key_storage: 'outside_public_site_artifacts',
      trust_pin_required: true,
      can_sign: false,
    });
    expect(pinned.trust_status).toBe('trusted_pinned');
  });

  it('resolves nested static_config Site identity for target Site roots', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-static-config-site-'));
    try {
      writeFileSync(join(siteRoot, 'config.json'), `${JSON.stringify({
        schema: 'narada.site.config.v0',
        static_config: {
          site_id: 'narada-andrey',
          site_kind: 'user_site',
          site_root: siteRoot,
          locus: { authority_locus: 'user' },
        },
      }, null, 2)}\n`);

      expect(resolveMcpSiteContext({ siteRoot })).toMatchObject({
        site_id: 'narada-andrey',
        site_kind: 'user_site',
        site_root: siteRoot,
        authority_locus: 'user',
        source: 'config',
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('keeps lift adoption packets advisory and refuses non-portable source paths', () => {
    const advisory = buildAdvisoryLiftPacket({
      source_ref: 'kb/operations/narada-proper-mcp-coverage-matrix-20260516.md',
      source_fresh: false,
      portable_path: true,
    });
    const refused = buildAdvisoryLiftPacket({
      source_ref: 'C:\\Users\\Andrey\\Narada\\.ai\\mcp\\runtime.json',
      portable_path: false,
    });

    expect(advisory).toMatchObject({
      status: 'advisory_requires_receiving_site_admission',
      stale_source_detected: true,
      receiving_site_admission_required: true,
      target_mutated: false,
    });
    expect(refused).toMatchObject({
      status: 'refused',
      non_portable_path_refused: true,
      receiving_site_admission_required: true,
      target_mutated: false,
    });
  });

  it('generates Codex and generic stdio carrier configs from the registry without client mutation', () => {
    const codex = generateCarrierMcpConfig({
      client_shape: 'codex',
      site_root: 'D:/code/narada',
      site_id: 'narada-proper',
      agent_id_env: 'narada.builder',
    });
    const generic = generateCarrierMcpConfig({
      client_shape: 'generic_stdio',
      site_root: 'D:/code/narada',
      site_id: 'narada-proper',
    });

    expect(codex.missing_snippets).toEqual([]);
    expect(codex.private_client_mutation_performed).toBe(false);
    expect(codex.transport_wiring_only).toBe(true);
    expect(codex.config).toMatchObject({
      mcpServers: {
        narada: {
          command: 'narada-proper-mcp',
          args: ['--site-root', 'D:/code/narada', '--site-id', 'narada-proper'],
          env: {
            NARADA_SITE_ROOT: 'D:/code/narada',
            NARADA_SITE_ID: 'narada-proper',
            NARADA_AGENT_ID: 'narada.builder',
          },
        },
      },
    });
    expect(generic.config).toMatchObject({
      name: 'narada',
      transport: 'stdio',
      command: 'narada-proper-mcp',
    });
  });

  it('reports registry config drift and quarantines the legacy CLI MCP facade', () => {
    const [record] = NARADA_PROPER_MCP_SURFACE_REGISTRY;
    const drift = generateCarrierMcpConfig({
      client_shape: 'generic_stdio',
      site_root: 'D:/code/narada',
      registry: [{
        ...record,
        runtime_binding: {
          ...record.runtime_binding,
          generated_client_config_posture: 'not_generated',
        },
      }],
    });

    expect(drift.missing_snippets).toContain('narada_proper_mcp_transport_wiring_posture_missing');
    expect(LEGACY_CLI_MCP_FACADE_POSTURE).toMatchObject({
      path: 'packages/layers/cli/src/mcp-server.ts',
      status: 'compatibility_quarantined',
      replacement: '@narada2/narada-proper-mcp',
      monolithic_cli_dist_required_for_covered_surfaces: false,
    });
  });

  it('projects the target workspace bin directory onto the Narada CLI PATH', () => {
    const env = localNaradaCliEnvironment('D:/code/narada', { PATH: 'C:/Windows/System32' }, 'win32');

    expect(env.PATH).toBe('D:\\code\\narada\\node_modules\\.bin;C:/Windows/System32');
  });

  it('resolves a PowerShell Narada shim through PATH on Windows', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'narada-mcp-workspace-'));
    const shimDir = mkdtempSync(join(tmpdir(), 'narada-mcp-shim-'));
    try {
      writeFileSync(join(shimDir, 'narada.ps1'), 'exit 0\n');

      const invocation = localNaradaCliInvocation(workspace, { PATH: shimDir }, 'win32');

      expect(invocation.command).toBe('powershell.exe');
      expect(invocation.args).toEqual([
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(shimDir, 'narada.ps1'),
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(shimDir, { recursive: true, force: true });
    }
  });

  it('prefers the target workspace Narada shim over later PATH entries', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'narada-mcp-workspace-'));
    const laterPath = mkdtempSync(join(tmpdir(), 'narada-mcp-later-'));
    try {
      const workspaceBin = join(workspace, 'node_modules', '.bin');
      mkdirSync(workspaceBin, { recursive: true });
      writeFileSync(join(workspaceBin, 'narada.cmd'), '@echo off\r\n');
      writeFileSync(join(laterPath, 'narada.cmd'), '@echo off\r\n');

      const invocation = localNaradaCliInvocation(workspace, { PATH: laterPath, ComSpec: 'cmd.exe' }, 'win32');

      expect(invocation).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', join(workspaceBin, 'narada.cmd')],
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
      rmSync(laterPath, { recursive: true, force: true });
    }
  });

  it('lists tools and hydrates current launch evidence over stdio', async () => {
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runNaradaProperMcp({
      stdin: input,
      stdout: output,
      siteRoot: process.cwd(),
      siteId: 'narada-proper',
      agentId: 'narada.architect',
      agentRole: 'architect',
      agentStartEventId: 'agent_start_test',
      carrierSessionId: 'carrier_session_test',
      agentContextDb: 'agent-context.sqlite',
    });

    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    await output.waitForLineCount(1);
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"agent_context_hydrate_current","arguments":{}}}\n');
    await output.waitForLineCount(2);
    input.end();
    await running;

    const list = JSON.parse(output.lines[0]);
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('agent_context_hydrate_current');
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('agent_context_startup_sequence');
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('site_task_lifecycle.read_task');
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('site_task_lifecycle.materialize_task');
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('narada_task_read');
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('site_registry_relation_plan_transition');
    const admitTaskTool = list.result.tools.find((tool: { name: string }) => tool.name === 'site_task_lifecycle.admit_task');
    expect(admitTaskTool.description).toContain('inert local task-admission row');
    expect(admitTaskTool.description).toContain('does not materialize a canonical governed task');

    const hydrated = JSON.parse(JSON.parse(output.lines[1]).result.content[0].text);
    expect(hydrated).toMatchObject({
      status: 'success',
      agent_id: 'narada.architect',
      start_event_id: 'agent_start_test',
      carrier_session_id: 'carrier_session_test',
      source: 'launcher_arguments',
      mutation_attempted: false,
      runtime_hydration_attempted: false,
    });
    expect(hydrated.source_state_imported ?? false).toBe(false);
  });

  it('delegates narada_task_read to the canonical CLI without cross-site mutation', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'narada-mcp-task-read-'));
    const workspaceBin = join(workspace, 'node_modules', '.bin');
    mkdirSync(workspaceBin, { recursive: true });
    writeFileSync(join(workspaceBin, 'narada.cmd'), '@echo off\r\necho {"status":"ok","task_number":1368,"source":"canonical_task_read"}\r\n');
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runNaradaProperMcp({
      stdin: input,
      stdout: output,
      siteRoot: workspace,
      siteId: 'narada-proper',
    });

    input.write('{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"narada_task_read","arguments":{"task_number":1368}}}\n');
    await output.waitForLineCount(1);
    input.end();
    await running;

    const payload = JSON.parse(JSON.parse(output.lines[0]).result.content[0].text);
    expect(payload).toMatchObject({
      status: 'ok',
      task_number: 1368,
      source: 'canonical_task_read',
    });
    expect(payload.traversal.mutation_attempted).toBe(false);
    expect(payload.traversal.cross_site).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('task-lifecycle.db');
    rmSync(workspace, { recursive: true, force: true });
  });

  it('accepts agent_id as an alias for narada_task_work_next agent', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'narada-mcp-task-work-next-alias-'));
    const workspaceBin = join(workspace, 'node_modules', '.bin');
    mkdirSync(workspaceBin, { recursive: true });
    writeFileSync(join(workspaceBin, 'narada.cmd'), '@echo off\r\necho {"status":"ok","agent_id":"narada.architect","source":"canonical_task_work_next"}\r\n');
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runNaradaProperMcp({
      stdin: input,
      stdout: output,
      siteRoot: workspace,
      siteId: 'narada-proper',
    });

    input.write('{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"narada_task_work_next","arguments":{"agent_id":"narada.architect","claim":false}}}\n');
    await output.waitForLineCount(1);
    input.end();
    await running;

    const payload = JSON.parse(JSON.parse(output.lines[0]).result.content[0].text);
    expect(payload).toMatchObject({
      status: 'ok',
      agent_id: 'narada.architect',
      source: 'canonical_task_work_next',
    });
    expect(payload.traversal.mutation_attempted).toBe(false);
    rmSync(workspace, { recursive: true, force: true });
  });

  it('delegates Site Registry relation transition planning to the canonical CLI without live mutation', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'narada-mcp-site-registry-plan-'));
    const workspaceBin = join(workspace, 'node_modules', '.bin');
    const payloadFile = join(workspace, 'transition.json');
    mkdirSync(workspaceBin, { recursive: true });
    writeFileSync(payloadFile, '{}\n');
    writeFileSync(join(workspaceBin, 'narada.cmd'), '@echo off\r\necho {"schema":"narada.site_registry.relation_transition_plan.v0","status":"planned","live_network_performed":false,"mutation_performed":false}\r\n');
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runNaradaProperMcp({
      stdin: input,
      stdout: output,
      siteRoot: workspace,
      siteId: 'narada-proper',
    });

    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'site_registry_relation_plan_transition',
        arguments: { payload_file: payloadFile },
      },
    })}\n`);
    await output.waitForLineCount(1);
    input.end();
    await running;

    const payload = JSON.parse(JSON.parse(output.lines[0]).result.content[0].text);
    expect(payload).toMatchObject({
      schema: 'narada.site_registry.relation_transition_plan.v0',
      status: 'planned',
      live_network_performed: false,
      mutation_performed: false,
      traversal: {
        mutation_attempted: false,
        cross_site: false,
      },
    });
    rmSync(workspace, { recursive: true, force: true });
  });

  it('exposes User Site-compatible inbox aliases and gates cross-site sends by capability grant', async () => {
    const source = mkdtempSync(join(tmpdir(), 'narada-mcp-cross-source-'));
    const target = mkdtempSync(join(tmpdir(), 'narada-mcp-cross-target-'));
    const targetBin = join(target, 'node_modules', '.bin');
    mkdirSync(join(source, '.ai'), { recursive: true });
    mkdirSync(targetBin, { recursive: true });
    writeFileSync(join(target, 'config.json'), `${JSON.stringify({
      schema: 'narada.site.config.v0',
      static_config: {
        site_id: 'narada-andrey',
        site_kind: 'user_site',
        site_root: target,
        locus: { authority_locus: 'user' },
      },
    }, null, 2)}\n`);
    writeFileSync(join(targetBin, 'narada.cmd'), '@echo off\r\necho {"status":"success","envelope":{"envelope_id":"env_cross"},"source":"target_inbox"}\r\n');
    const targetSiteId = 'narada-andrey';

    try {
      const input = new PassThrough();
      const output = new CaptureStream();
      const running = runNaradaProperMcp({
        stdin: input,
        stdout: output,
        siteRoot: source,
        siteId: 'narada-proper',
      });

      input.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
      await output.waitForLineCount(1);
      input.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'inbox_submit_observation',
          arguments: {
            target: { kind: 'site', site_root: target },
            source_ref: 'test:cross-site',
            title: 'Cross-site message',
          },
        },
      })}\n`);
      await output.waitForLineCount(2);
      input.end();
      await running;

      const tools = JSON.parse(output.lines[0]).result.tools.map((tool: { name: string }) => tool.name);
      expect(tools).toContain('inbox_submit_observation');
      expect(tools).toContain('inbox_stage_submission_workflow');
      expect(tools).toContain('inbox_submit_typed_envelope');
      expect(tools).toContain('narada_inbox_stage_submission_workflow');
      const refused = JSON.parse(JSON.parse(output.lines[1]).result.content[0].text);
      expect(refused).toMatchObject({
        status: 'error',
        traversal: {
          cross_site: true,
          required_capability_kind: 'canonical_inbox_cross_site_submission',
          capability_status: 'missing',
        },
      });

      writeFileSync(join(source, '.ai', 'capability-consent-registry.json'), `${JSON.stringify({
        grants: [{
          grant_id: 'grant_cross_inbox',
          site_id: targetSiteId,
          capability_kind: 'canonical_inbox_cross_site_submission',
          status: 'active',
          allowed_actions: ['inbox_stage_submission_workflow', 'inbox_submit_observation', 'inbox_submit_typed_envelope'],
        }],
      }, null, 2)}\n`);

      const input2 = new PassThrough();
      const output2 = new CaptureStream();
      const running2 = runNaradaProperMcp({
        stdin: input2,
        stdout: output2,
        siteRoot: source,
        siteId: 'narada-proper',
      });
      input2.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'inbox_stage_submission_workflow',
          arguments: {
            target: { kind: 'site', site_root: target },
            source_ref: 'test:cross-site',
            kind: 'proposal',
            payload: { title: 'Cross-site proposal', summary: 'Send to another Site inbox.' },
            submit: true,
          },
        },
      })}\n`);
      await output2.waitForLineCount(1);
      input2.end();
      await running2;

      const submitted = JSON.parse(JSON.parse(output2.lines[0]).result.content[0].text);
      expect(submitted).toMatchObject({
        status: 'success',
        source: 'target_inbox',
        traversal: {
          cross_site: true,
          capability_status: 'active',
          capability_grant_id: 'grant_cross_inbox',
        },
      });
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('refuses source runtime imports and supports read-only checkpoint calls', async () => {
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runNaradaProperMcp({
      stdin: input,
      stdout: output,
      siteRoot: process.cwd(),
      siteId: 'narada-proper',
    });

    input.write('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agent_context_memory.record_checkpoint","arguments":{"checkpoint_id":"checkpoint-refused","session_id":"session-refused","named_agent_id":"narada.architect","summary":"refused","source_import_refs":["C:/ProgramData/Narada/sites/pc/runtime/carrier-sessions/source.json"]}}}\n');
    await output.waitForLineCount(1);
    input.write('{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"agent_context_memory.read_checkpoint_summary","arguments":{"checkpoint_id":"checkpoint-missing"}}}\n');
    await output.waitForLineCount(2);
    input.end();
    await running;

    const refused = JSON.parse(JSON.parse(output.lines[0]).result.content[0].text);
    expect(refused).toMatchObject({
      status: 'error',
      error: 'denied_source_import_ref',
      mutationExecuted: false,
      sourceStateImported: false,
    });

    const readOnly = JSON.parse(JSON.parse(output.lines[1]).result.content[0].text);
    expect(readOnly).toMatchObject({
      status: 'not_found',
      checkpointId: 'checkpoint-missing',
      mutationAttempted: false,
      mutationExecuted: false,
    });
  });

  it('runs canonical startup sequence with checkpoint continuity from local memory without runtime hydration', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-proper-mcp-memory-'));
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runNaradaProperMcp({
      stdin: input,
      stdout: output,
      siteRoot,
      siteId: 'narada-proper',
      agentId: 'narada.architect',
      agentRole: 'architect',
      agentStartEventId: 'agent_start_sequence_test',
      carrierSessionId: 'carrier_sequence_test',
      agentContextDb: 'agent-context.sqlite',
    });

    try {
      input.write('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agent_context_memory.record_checkpoint","arguments":{"checkpoint_id":"checkpoint-old","session_id":"session-old","named_agent_id":"narada.architect","summary":"older continuity","captured_at":"2026-05-14T10:00:00.000Z"}}}\n');
      await output.waitForLineCount(1);
      input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"agent_context_memory.record_checkpoint","arguments":{"checkpoint_id":"checkpoint-latest","session_id":"session-latest","named_agent_id":"narada.architect","summary":"latest continuity","captured_at":"2026-05-15T10:00:00.000Z"}}}\n');
      await output.waitForLineCount(2);
      input.write('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agent_context_memory.record_checkpoint","arguments":{"checkpoint_id":"checkpoint-other-agent","session_id":"session-other","named_agent_id":"narada.builder","summary":"wrong agent","captured_at":"2026-05-16T10:00:00.000Z"}}}\n');
      await output.waitForLineCount(3);
      input.write('{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"agent_context_memory.plan_hydration","arguments":{"named_agent_id":"narada.architect","requested_by":"startup-sequence"}}}\n');
      await output.waitForLineCount(4);
      input.write('{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"agent_context_memory.read_checkpoint_summary","arguments":{"checkpoint_id":"checkpoint-latest"}}}\n');
      await output.waitForLineCount(5);
      input.write('{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"agent_context_startup_sequence","arguments":{}}}\n');
      await output.waitForLineCount(6);
      input.end();
      await running;

      const plan = JSON.parse(JSON.parse(output.lines[3]).result.content[0].text);
      expect(plan).toMatchObject({
        status: 'success',
        checkpointHydrationPlanned: true,
        checkpointSummaryLoaded: false,
        runtimeHydrationExecuted: false,
        mutationAttempted: false,
        mutationExecuted: false,
        advisoryOnly: true,
        selectedCheckpoint: {
          checkpointId: 'checkpoint-latest',
          namedAgentId: 'narada.architect',
          summaryAvailable: true,
        },
      });
      expect(plan.descriptor.checkpointRefs).toEqual(['checkpoint-latest']);
      expect(plan.eligibleCheckpoints.map((checkpoint: { checkpointId: string }) => checkpoint.checkpointId)).toEqual([
        'checkpoint-latest',
        'checkpoint-old',
      ]);

      const summary = JSON.parse(JSON.parse(output.lines[4]).result.content[0].text);
      expect(summary).toMatchObject({
        status: 'success',
        checkpointId: 'checkpoint-latest',
        checkpoint: {
          checkpointId: 'checkpoint-latest',
          summary: 'latest continuity',
          namedAgentId: 'narada.architect',
        },
        mutationAttempted: false,
        runtimeHydrationExecuted: false,
      });

      const startup = JSON.parse(JSON.parse(output.lines[5]).result.content[0].text);
      expect(startup).toMatchObject({
        status: 'success',
        schema: 'narada.agent_context.startup_sequence_result.v0',
        startupSequenceExecuted: true,
        checkpointSummaryLoaded: true,
        advisoryOnly: true,
        mutationAttempted: false,
        mutationExecuted: false,
        runtimeHydrationExecuted: false,
        hydrate_current: {
          agent_id: 'narada.architect',
          start_event_id: 'agent_start_sequence_test',
        },
        memory_plan: {
          checkpointHydrationPlanned: true,
          runtimeHydrationExecuted: false,
          selectedCheckpoint: {
            checkpointId: 'checkpoint-latest',
            namedAgentId: 'narada.architect',
          },
        },
        checkpoint_summary: {
          status: 'success',
          checkpointId: 'checkpoint-latest',
          checkpoint: {
            summary: 'latest continuity',
          },
        },
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('reports aligned MCP policy reconciliation during startup without mutation', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-startup-policy-ok-'));
    try {
      const projection = buildNaradaProperArchitectRolePolicyProjection();
      writePolicyConfig(siteRoot, projection.tool_policy.canonical_allowed_tools);

      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'agent_context_startup_sequence', arguments: {} },
      }, {
        siteRoot,
        siteId: 'narada-proper',
        agentId: 'narada.architect',
      });
      const startup = JSON.parse((((response?.result as { content: Array<{ text: string }> }).content[0]).text));

      expect(startup.mcp_policy_reconciliation).toMatchObject({
        schema: 'narada.mcp_policy_reconciliation_startup_posture.v0',
        status: 'aligned',
        advisory_only: true,
        mutation_attempted: false,
        mutation_performed: false,
        auto_repair_performed: false,
        additions: [],
        removals: [],
        validation_errors: [],
        repair_command: {
          argv: ['narada-proper-mcp', '--site-root', siteRoot, '--reconcile-mcp-policy', '--apply'],
          posture: 'explicit_reconciler_apply_required',
        },
      });
      expect(startup.mcp_policy_reconciliation.source_result).toMatchObject({
        status: 'ok',
        mode: 'check',
        exit_code: 0,
        mutation_performed: false,
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('renders active admitted directives into startup directive context without mutation', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-startup-directives-'));
    try {
      await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'narada_directive_create',
          arguments: {
            source_kind: 'operator',
            source_id: 'andrey',
            authority_locus: 'operator',
            authority_basis: 'manual_directive',
            target_kind: 'agent',
            target_id: 'narada.architect',
            content_kind: 'instruction',
            text: 'Prefer directive objects over prompt fragments.',
          },
        },
      }, {
        siteRoot,
        siteId: 'narada-proper',
        agentId: 'narada.architect',
        agentRole: 'architect',
      });
      await handleMcpRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'narada_directive_create',
          arguments: {
            source_kind: 'operator',
            source_id: 'andrey',
            authority_locus: 'operator',
            authority_basis: 'manual_directive',
            target_kind: 'role',
            target_id: 'architect',
            content_kind: 'constraint',
            text: 'Keep architecture decisions explicit.',
          },
        },
      }, {
        siteRoot,
        siteId: 'narada-proper',
        agentId: 'narada.architect',
        agentRole: 'architect',
      });
      await handleMcpRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'narada_directive_create',
          arguments: {
            source_kind: 'operator',
            source_id: 'andrey',
            authority_locus: 'operator',
            authority_basis: 'manual_directive',
            target_kind: 'agent',
            target_id: 'narada.builder',
            content_kind: 'instruction',
            text: 'Builder-only directive.',
          },
        },
      }, {
        siteRoot,
        siteId: 'narada-proper',
        agentId: 'narada.architect',
        agentRole: 'architect',
      });

      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'agent_context_startup_sequence', arguments: {} },
      }, {
        siteRoot,
        siteId: 'narada-proper',
        agentId: 'narada.architect',
        agentRole: 'architect',
        carrierSessionId: 'carrier_sequence_test',
      });
      const startup = JSON.parse((((response?.result as { content: Array<{ text: string }> }).content[0]).text));

      expect(startup.directive_context).toMatchObject({
        schema: 'narada.agent_context.directive_context.v1',
        status: 'success',
        directive_count: 2,
        advisory_only: true,
        mutation_attempted: false,
        mutation_executed: false,
      });
      expect(startup.directive_context.targets).toEqual(expect.arrayContaining([
        { kind: 'site', id: 'narada-proper' },
        { kind: 'agent', id: 'narada.architect' },
        { kind: 'role', id: 'architect' },
        { kind: 'carrier', id: 'carrier_sequence_test' },
        { kind: 'session', id: 'carrier_sequence_test' },
      ]));
      expect(startup.directive_context.rendered).toContain('Prefer directive objects over prompt fragments.');
      expect(startup.directive_context.rendered).toContain('Keep architecture decisions explicit.');
      expect(startup.directive_context.rendered).not.toContain('Builder-only directive.');
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('reports startup MCP policy drift with exact additions, removals, and reconciler repair command', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-startup-policy-drift-'));
    try {
      const projection = buildNaradaProperArchitectRolePolicyProjection();
      const [missing, ...rest] = projection.tool_policy.canonical_allowed_tools;
      writePolicyConfig(siteRoot, [...rest, 'site_task_lifecycle.open_admitted_task']);

      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'agent_context_startup_sequence', arguments: {} },
      }, {
        siteRoot,
        siteId: 'narada-proper',
        agentId: 'narada.architect',
      });
      const startup = JSON.parse((((response?.result as { content: Array<{ text: string }> }).content[0]).text));

      expect(startup.status).toBe('success');
      expect(startup.mcp_policy_reconciliation).toMatchObject({
        status: 'drift',
        advisory_only: true,
        mutation_attempted: false,
        mutation_performed: false,
        additions: [missing],
        removals: ['site_task_lifecycle.open_admitted_task'],
        validation_errors: [
          `missing_canonical_tool:${missing}`,
          'stale_or_unknown_tool:site_task_lifecycle.open_admitted_task',
        ],
        repair_command: {
          command: `narada-proper-mcp --site-root ${siteRoot} --reconcile-mcp-policy --apply`,
        },
      });
      expect(startup.mcp_policy_reconciliation.source_result).toMatchObject({
        status: 'drift',
        mode: 'check',
        exit_code: 1,
        mutation_attempted: false,
        mutation_performed: false,
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('reports malformed startup MCP policy config as advisory drift posture without blocking startup', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-startup-policy-bad-'));
    try {
      writeFileSync(join(siteRoot, 'config.json'), '{not-json\n');

      const response = await handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'agent_context_startup_sequence', arguments: {} },
      }, {
        siteRoot,
        siteId: 'narada-proper',
        agentId: 'narada.architect',
      });
      const startup = JSON.parse((((response?.result as { content: Array<{ text: string }> }).content[0]).text));

      expect(startup.status).toBe('success');
      expect(startup.mcp_policy_reconciliation).toMatchObject({
        status: 'error',
        advisory_only: true,
        mutation_attempted: false,
        mutation_performed: false,
        error: 'config_json_malformed',
        repair_command: {
          argv: ['narada-proper-mcp', '--site-root', siteRoot, '--reconcile-mcp-policy', '--apply'],
        },
      });
      expect(startup.mcp_policy_reconciliation.source_result).toMatchObject({
        status: 'error',
        mode: 'check',
        exit_code: 2,
        mutation_performed: false,
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });
});

function writePolicyConfig(siteRoot: string, allowedTools: string[], extra: Record<string, unknown> = {}): void {
  writeFileSync(join(siteRoot, 'config.json'), `${JSON.stringify({
    site_id: 'narada-proper',
    site_kind: 'project',
    locus: { authority_locus: 'narada_proper' },
    mcp: {
      role_policies: {
        architect: {
          servers: {
            'narada-proper': {
              allowed_tools: allowedTools,
            },
          },
        },
      },
    },
    ...extra,
  }, null, 2)}\n`, 'utf8');
}

class CaptureStream extends Writable {
  readonly lines: string[] = [];
  private buffer = '';
  private waiters: Array<() => void> = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.buffer += chunk.toString('utf8');
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() ?? '';
    this.lines.push(...parts.filter((line) => line.length > 0));
    this.waiters.splice(0).forEach((resolve) => resolve());
    callback();
  }

  waitForLineCount(count: number): Promise<void> {
    if (this.lines.length >= count) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(() => {
        if (this.lines.length >= count) resolve();
        else this.waiters.push(resolve);
      });
    });
  }
}
