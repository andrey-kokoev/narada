import { describe, expect, it } from 'vitest';
import {
  DeniedSourceImportError,
  assertNoDeniedSourceImports,
  buildCrewStartupLaunchIntentSequence,
  buildCrewStartupPlan,
  findDeniedSourceImports,
} from '../src/index.js';
import {
  nativeShortcutFallbackRequest,
  validMcpOnlyStartupRequest,
} from './fixtures/neutral-requests.js';

describe('crew startup shortcut descriptor contracts', () => {
  it('builds a descriptor-only MCP startup plan without executing launch or PC mutation', () => {
    const plan = buildCrewStartupPlan(validMcpOnlyStartupRequest);

    expect(plan.schema).toBe('narada.crew_startup_shortcut.plan.v0');
    expect(plan.status).toBe('planned');
    if (plan.status !== 'planned') throw new Error('expected planned result');
    expect(plan.exposureClass).toBe('descriptor_only');
    expect(plan.mcpOnly).toBe(true);
    expect(plan.packageExecutedLaunch).toBe(false);
    expect(plan.packageMutatedPcState).toBe(false);
    expect(plan.nativeShellFallbackAllowed).toBe(false);
    expect(plan.requiredLocalAdmissions).toContain('operator_surface_launch_focus_bind');
  });

  it('refuses native shortcut fallback and source runtime imports', () => {
    const refusal = buildCrewStartupPlan(nativeShortcutFallbackRequest);

    expect(refusal.schema).toBe('narada.crew_startup_shortcut.refusal.v0');
    expect(refusal.status).toBe('refused');
    if (refusal.status !== 'refused') throw new Error('expected refused result');
    expect(refusal.reasons).toContain('native_shortcut_fallback_refused');
    expect(refusal.sourceImportFindings.map((finding) => finding.reason)).toEqual([
      'source Site crew shortcut state',
      'source checkpoint history',
    ]);
    expect(refusal.requiredBehavior).toBe('stop_and_report_missing_mcp_capability');
    expect(refusal.nativeShellFallbackAllowed).toBe(false);
  });

  it('detects denied source paths independently', () => {
    const findings = findDeniedSourceImports([
      'C:\\ProgramData\\Narada\\sites\\pc\\desktop-sunroom-2\\runtime\\shortcut-state.json',
      'C:\\Users\\Andrey\\Narada\\operator-surfaces\\runtime-bindings.json',
      'C:\\Users\\Andrey\\Narada\\secrets\\token.txt',
      'C:\\Users\\Andrey\\Narada\\start-builder.ps1',
    ]);

    expect(findings.map((finding) => finding.reason)).toEqual([
      'PC-locus runtime state',
      'operator-surface runtime state',
      'secret or credential material',
      'carrier-specific native shortcut or script',
    ]);
    expect(() => assertNoDeniedSourceImports(findings.map((finding) => finding.path)))
      .toThrow(DeniedSourceImportError);
  });

  it('builds a working launch intent sequence without launching processes', () => {
    const sequence = buildCrewStartupLaunchIntentSequence(validMcpOnlyStartupRequest);

    expect(sequence.schema).toBe('narada.crew_startup_shortcut.launch_intent_sequence.v0');
    expect(sequence.status).toBe('ready_for_admitted_carrier');
    if (sequence.status !== 'ready_for_admitted_carrier') throw new Error('expected launch intent sequence');
    expect(sequence.exposureClass).toBe('request_response');
    expect(sequence.sequenceSteps.map((step) => step.requiredTool).filter(Boolean)).toContain('agent_context_memory.plan_hydration');
    expect(sequence.sequenceSteps.map((step) => step.requiredTool).filter(Boolean)).toContain('agent_context_memory.read_checkpoint_summary');
    expect(sequence.launchHandoff.executionAdmitted).toBe(false);
    expect(sequence.launchHandoff.carrierRequired).toBe('operator_surface_launch_focus_bind');
    expect(sequence.packageExecutedLaunch).toBe(false);
    expect(sequence.packageMutatedPcState).toBe(false);
    expect(sequence.operatorSurfaceRuntimeMutated).toBe(false);
    expect(sequence.nativeShellFallbackAllowed).toBe(false);
  });

  it('refuses to build a launch intent sequence from native shortcut fallback input', () => {
    const sequence = buildCrewStartupLaunchIntentSequence(nativeShortcutFallbackRequest);

    expect(sequence.schema).toBe('narada.crew_startup_shortcut.refusal.v0');
    expect(sequence.status).toBe('refused');
    if (sequence.status !== 'refused') throw new Error('expected refusal');
    expect(sequence.reasons).toContain('native_shortcut_fallback_refused');
  });
});
