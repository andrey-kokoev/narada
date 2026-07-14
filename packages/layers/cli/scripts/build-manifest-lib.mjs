import { join } from 'node:path';
import {
  checkLaunchArtifact,
  computeLaunchArtifactSourceClosure,
  resolveLaunchArtifactDescriptor,
} from './launch-artifact-lib.mjs';

export const BUILD_MANIFEST_SCHEMA = 'narada.cli.dist_build_manifest.v0';
export const BUILD_MANIFEST_PATH = join('packages', 'layers', 'cli', 'dist', 'build-manifest.json');

export function computeCliBuildSourceHash(siteRoot) {
  const descriptor = resolveLaunchArtifactDescriptor(siteRoot, 'narada-cli');
  const sourceClosure = computeLaunchArtifactSourceClosure(siteRoot, descriptor);
  return {
    algorithm: sourceClosure.algorithm,
    source_hash: sourceClosure.source_hash,
    input_count: sourceClosure.input_count,
    inputs: sourceClosure.inputs,
  };
}

export function checkCliDistFreshness(siteRoot) {
  const result = checkLaunchArtifact(siteRoot, 'narada-cli');
  return {
    ...result,
    manifest_path: result.artifact_manifest_path ?? join(siteRoot, BUILD_MANIFEST_PATH),
    current: result.source_closure
      ? {
        algorithm: result.source_closure.algorithm,
        source_hash: result.source_closure.source_hash,
        input_count: result.source_closure.input_count,
        inputs: result.source_closure.inputs,
      }
      : undefined,
  };
}
