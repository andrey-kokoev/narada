import { describe, expect, it } from 'vitest';
import {
  DeniedSourceImportError,
  assertNoDeniedSourceImports,
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
});
