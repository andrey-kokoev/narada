export interface LaunchArtifactDescriptor {
  schema: 'narada.launch_artifact.v1';
  target: string;
  package_name: string;
  package_root: string;
  package_root_relative: string;
  output_root: string;
  output_root_relative: string;
  build_script: string;
  required_outputs: string[];
  package_json: Record<string, unknown>;
}

export interface LaunchArtifactCheck {
  status: 'current' | 'stale' | 'not_applicable';
  target: string;
  reason?: string;
  package?: string;
  package_root?: string;
  output_root?: string;
  artifact_root?: string;
  artifact_manifest_path?: string;
  required_command?: string;
  source_hash?: string;
  input_count?: number;
  [key: string]: unknown;
}

export function resolveLaunchArtifactDescriptor(siteRoot: string, target: string, options?: { packageRoot?: string }): LaunchArtifactDescriptor;
export function computeLaunchArtifactSourceClosure(siteRoot: string, descriptor: LaunchArtifactDescriptor): { algorithm: string; source_hash: string; input_count: number; inputs: string[]; packages: string[] };
export function checkLaunchArtifact(siteRoot: string, target: string): LaunchArtifactCheck;
export function writeLaunchArtifactManifest(options: { siteRoot: string; target: string; packageRoot?: string }): Record<string, unknown>;
