export type WindowsMachineryPackageId =
  | '@narada2/mcp-shell-windows'
  | '@narada2/mcp-test-windows'
  | '@narada2/windows-operator-surface'
  | '@narada2/windows-osl'
  | '@narada2/windows-pc-site-template'
  | '@narada2/windows-komorebi-yasb-kit';

export interface WindowsMachineryAdoptionManifest {
  schema: 'narada.windows_machinery_capability_exchange.manifest.v0';
  status: 'descriptor_only';
  packages: WindowsMachineryPackageId[];
  dependency_order: WindowsMachineryPackageId[];
  receiving_site_checklist: string[];
  non_portable_exclusions: string[];
  live_authority_not_granted: string[];
  source_state_imported: false;
}

export const WINDOWS_MACHINERY_PACKAGES: WindowsMachineryPackageId[] = [
  '@narada2/mcp-shell-windows',
  '@narada2/mcp-test-windows',
  '@narada2/windows-operator-surface',
  '@narada2/windows-osl',
  '@narada2/windows-pc-site-template',
  '@narada2/windows-komorebi-yasb-kit',
];

export function buildWindowsMachineryAdoptionManifest(): WindowsMachineryAdoptionManifest {
  return {
    schema: 'narada.windows_machinery_capability_exchange.manifest.v0',
    status: 'descriptor_only',
    packages: WINDOWS_MACHINERY_PACKAGES,
    dependency_order: WINDOWS_MACHINERY_PACKAGES,
    receiving_site_checklist: [
      'record package id and version',
      'name local authority owner',
      'rewrite identities to receiving-Site fixtures',
      'rewrite runtime paths to receiving Site or PC Site',
      'run fixture-safe tests in receiving context',
      'record rejected non-portable state',
      'record residuals and deferred capabilities',
    ],
    non_portable_exclusions: [
      'PC runtime SQLite databases',
      'live HWND bindings',
      'generated runtime projections',
      'logs and PIDs',
      'live Komorebi or YASB state',
      'andrey-user identity authority',
      'secrets or credentials',
    ],
    live_authority_not_granted: [
      'live shell authority',
      'PC-locus mutation authority',
      'task lifecycle mutation authority',
      'external publication authority',
      'private MCP client mutation',
    ],
    source_state_imported: false,
  };
}

export {
  buildWindowsMachineryConformanceReport,
  type WindowsMachineryConformanceReport,
  type WindowsMachinerySliceRecord,
  type WindowsMachinerySliceState,
} from './conformance.js';
