import type { WindowsMachineryPackageId } from './index.js';

const CONFORMANCE_PACKAGES: WindowsMachineryPackageId[] = [
  '@narada2/mcp-shell-windows',
  '@narada2/mcp-test-windows',
  '@narada2/windows-operator-surface',
  '@narada2/windows-osl',
  '@narada2/windows-pc-site-template',
  '@narada2/windows-komorebi-yasb-kit',
];

export type WindowsMachinerySliceState =
  | 'seed_descriptor'
  | 'deepened_descriptor_contracts'
  | 'not_adopted';

export interface WindowsMachinerySliceRecord {
  package_id: WindowsMachineryPackageId;
  state: WindowsMachinerySliceState;
  evidence_ref: string;
  live_authority_claimed: false;
}

export interface WindowsMachineryConformanceReport {
  schema: 'narada.windows_machinery_capability_exchange.conformance_report.v0';
  status: 'complete_descriptor_set' | 'incomplete_descriptor_set';
  package_records: WindowsMachinerySliceRecord[];
  missing_packages: WindowsMachineryPackageId[];
  refused_state: string[];
  descriptor_only: true;
}

export function buildWindowsMachineryConformanceReport(
  records: WindowsMachinerySliceRecord[],
): WindowsMachineryConformanceReport {
  const seen = new Set(records.map((record) => record.package_id));
  const missing = CONFORMANCE_PACKAGES.filter((packageId) => !seen.has(packageId));

  return {
    schema: 'narada.windows_machinery_capability_exchange.conformance_report.v0',
    status: missing.length === 0 ? 'complete_descriptor_set' : 'incomplete_descriptor_set',
    package_records: records,
    missing_packages: missing,
    refused_state: [
      'runtime_databases',
      'task_inbox_history',
      'checkpoints_or_rosters',
      'operator_surface_runtime_state',
      'pc_locus_state',
      'secrets_or_credentials',
      'live_shell_or_process_authority',
    ],
    descriptor_only: true,
  };
}
