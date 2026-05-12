import { describe, expect, it } from 'vitest';
import {
  assembleBindingDiagnosis,
  assembleRuntimeBindingProjection,
  classifyBindingLiveness,
  type BindingAuthorityRow,
  type BindingLivenessEvidence,
} from '../src/index.js';

describe('windows operator surface binding diagnosis service', () => {
  it('classifies Windows Terminal PID/title churn as volatile evidence drift, not binding failure', () => {
    const classification = classifyBindingLiveness({
      window_live: true,
      guard_drift: ['pid_mismatch', 'title_mismatch'],
      current: { window_class: 'CASCADIA_HOSTING_WINDOW_CLASS' },
    });

    expect(classification.status).toBe('healthy');
    expect(classification.volatile_evidence_drift).toEqual(['pid_mismatch', 'title_mismatch']);
  });

  it('assembles fixture-safe binding diagnosis from receiving-Site supplied rows', () => {
    const rows: BindingAuthorityRow[] = [
      { binding_id: 'b1', surface_id: 's1', identity_id: 'neutral.agent.alex', hwnd: 101 },
      { binding_id: 'b2', surface_id: 's2', identity_id: 'neutral.agent.blair', hwnd: 202 },
      { binding_id: 'b3', surface_id: 's3', identity_id: 'neutral.agent.casey', hwnd: null },
    ];
    const liveness = new Map<string, BindingLivenessEvidence>([
      ['s1', { window_live: true, current: { window_class: 'CASCADIA_HOSTING_WINDOW_CLASS' } }],
      ['s2', { window_live: true, guard_drift: ['process_mismatch'], current: { window_class: 'OtherWindow' } }],
    ]);

    const diagnosis = assembleBindingDiagnosis({ rows, livenessBySurfaceId: liveness });

    expect(diagnosis.authority).toBe('receiving_site_supplied');
    expect(diagnosis.healthy).toBe(1);
    expect(diagnosis.guard_drift).toBe(1);
    expect(diagnosis.dead).toBe(1);
    expect(diagnosis.package_imported_runtime_state).toBe(false);
    expect(diagnosis.bindings[1].recommended_action).toBe('operator_surface_bind_or_unbind_after_identity_check');
  });

  it('projects runtime binding compatibility data without owning runtime authority', () => {
    const rows: BindingAuthorityRow[] = [{
      binding_id: 'b1',
      surface_id: 's1',
      identity_id: 'neutral.agent.alex',
      hwnd: 101,
      assertion_method: 'fixture',
    }];
    const projection = assembleRuntimeBindingProjection({
      rows,
      evidenceBySurfaceId: new Map([
        ['s1', {
          window_live: true,
          current: {
            window_class: 'CASCADIA_HOSTING_WINDOW_CLASS',
            process_name: 'WindowsTerminal.exe',
            window_title: 'neutral terminal',
          },
        }],
      ]),
    });

    expect(projection.projection_authority).toBe('receiving_site_supplied');
    expect(projection.package_imported_runtime_state).toBe(false);
    expect(projection.bindings[0]).toMatchObject({
      hwnd: 101,
      identity_id: 'neutral.agent.alex',
      observed_process: 'WindowsTerminal.exe',
      projection_source_surface_id: 's1',
    });
  });
});
