import { describe, expect, it } from 'vitest';
import {
  WINDOWS_MACHINERY_PACKAGES,
  buildWindowsMachineryConformanceReport,
  type WindowsMachinerySliceRecord,
} from '../src/index.js';

function completeRecords(): WindowsMachinerySliceRecord[] {
  return WINDOWS_MACHINERY_PACKAGES.map((package_id) => ({
    package_id,
    state: 'deepened_descriptor_contracts',
    evidence_ref: `fixture:${package_id}`,
    live_authority_claimed: false,
  }));
}

describe('windows machinery conformance report', () => {
  it('reports complete descriptor-set conformance without live authority', () => {
    const report = buildWindowsMachineryConformanceReport(completeRecords());

    expect(report.status).toBe('complete_descriptor_set');
    expect(report.missing_packages).toEqual([]);
    expect(report.descriptor_only).toBe(true);
    expect(report.package_records.every((record) => record.live_authority_claimed === false)).toBe(true);
  });

  it('names missing package slices and preserves refused state classes', () => {
    const report = buildWindowsMachineryConformanceReport(completeRecords().slice(0, 2));

    expect(report.status).toBe('incomplete_descriptor_set');
    expect(report.missing_packages).toContain('@narada2/windows-operator-surface');
    expect(report.refused_state).toEqual(expect.arrayContaining([
      'runtime_databases',
      'operator_surface_runtime_state',
      'pc_locus_state',
      'secrets_or_credentials',
    ]));
  });
});
