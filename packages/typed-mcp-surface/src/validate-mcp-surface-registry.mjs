#!/usr/bin/env node

/**
 * MCP Surface Registry Validation
 *
 * Validates the MCP surface registry for consistency and correctness.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const registryPath = resolve('.narada/capabilities/mcp-surfaces.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

let errors = [];
let warnings = [];
let localProjectionNotes = [];

function validateRegistry() {
  // Check schema
  if (registry.schema !== 'narada.site.capabilities.mcp_surfaces.v1') {
    errors.push(`Invalid schema: expected narada.site.capabilities.mcp_surfaces.v1, got ${registry.schema}`);
  }

  // Check artifact role
  if (registry.artifact_role !== 'site_capability_surface_registry_not_mcp_client_config') {
    errors.push(`Invalid artifact_role: expected site_capability_surface_registry_not_mcp_client_config`);
  }

  // Check surfaces
  if (!Array.isArray(registry.surfaces)) {
    errors.push('surfaces must be an array');
    return;
  }

  for (const surface of registry.surfaces) {
    validateSurface(surface);
  }
}

function validateSurface(surface) {
  const surfaceId = surface.surface_id;

  // Required fields
  const requiredFields = ['surface_id', 'surface_type', 'display_name', 'runtime_binding', 'authority_boundary', 'tool_contract', 'client_config', 'evidence'];
  for (const field of requiredFields) {
    if (!surface[field]) {
      errors.push(`Surface ${surfaceId}: missing required field ${field}`);
    }
  }

  // Runtime binding validation
  if (surface.runtime_binding) {
    if (!surface.runtime_binding.transport?.command) {
      errors.push(`Surface ${surfaceId}: runtime_binding.transport.command is required`);
    }
    if (!surface.runtime_binding.transport?.args) {
      errors.push(`Surface ${surfaceId}: runtime_binding.transport.args is required`);
    }
  }

  // Tool contract validation
  if (surface.tool_contract) {
    const contract = surface.tool_contract;

    if (!Array.isArray(contract.semantic_operations)) {
      errors.push(`Surface ${surfaceId}: tool_contract.semantic_operations must be an array`);
    }
    if (!Array.isArray(contract.exposed_tools)) {
      errors.push(`Surface ${surfaceId}: tool_contract.exposed_tools must be an array`);
    }
    if (typeof contract.deprecated_aliases !== 'object') {
      errors.push(`Surface ${surfaceId}: tool_contract.deprecated_aliases must be an object`);
    }

    // Check that no tool argument appears in semantic_operations
    if (contract.tool_arguments) {
      for (const [tool, args] of Object.entries(contract.tool_arguments)) {
        for (const arg of args) {
          if (contract.semantic_operations.includes(arg)) {
            errors.push(`Surface ${surfaceId}: tool argument "${arg}" should not appear in semantic_operations`);
          }
        }
      }
    }

    // Check read_only_tools and mutating_tools are subsets of exposed_tools
    if (contract.read_only_tools) {
      for (const tool of contract.read_only_tools) {
        if (!contract.exposed_tools.includes(tool)) {
          errors.push(`Surface ${surfaceId}: read_only_tools contains tool not in exposed_tools: ${tool}`);
        }
      }
    }
    if (contract.mutating_tools) {
      for (const tool of contract.mutating_tools) {
        if (!contract.exposed_tools.includes(tool)) {
          errors.push(`Surface ${surfaceId}: mutating_tools contains tool not in exposed_tools: ${tool}`);
        }
      }
    }
  }

  // Client config validation
  if (surface.client_config) {
    if (!surface.client_config.generated_path) {
      errors.push(`Surface ${surfaceId}: client_config.generated_path is required`);
    } else {
      // Individual snippets are local compatibility projections by default.
      // Validate them when present, but do not require them for registry validity.
      const configPath = resolve(surface.client_config.generated_path);
      if (!existsSync(configPath)) {
        localProjectionNotes.push(`Surface ${surfaceId}: local snippet projection absent: ${surface.client_config.generated_path}`);
      } else {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf8'));
          if (!config.mcpServers) {
            errors.push(`Surface ${surfaceId}: generated config must contain mcpServers`);
          }
        } catch (e) {
          errors.push(`Surface ${surfaceId}: generated config is not valid JSON: ${e.message}`);
        }
      }
    }
  }
}

validateRegistry();

if (errors.length > 0) {
  console.log('VALIDATION ERRORS:');
  for (const error of errors) {
    console.log(`  - ${error}`);
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('VALIDATION WARNINGS:');
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

console.log('Snippet policy: .ai/mcp/*.json snippets are local projections by default; registry transport metadata is the source of truth.');
if (localProjectionNotes.length > 0) {
  console.log('LOCAL PROJECTION NOTES:');
  for (const note of localProjectionNotes) {
    console.log(`  - ${note}`);
  }
}

console.log('Registry validation passed');
process.exit(0);
