#!/usr/bin/env node

/**
 * Registry-driven MCP smoke test.
 *
 * Verifies configured Narada MCP servers against .narada/capabilities/mcp-surfaces.json.
 * Doctor tools are resolved from each registry surface's declared exposed_tools.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnTestChild } from '@narada2/process-launch-posture';

const options = parseArgs(process.argv.slice(2));

if (options.help || !options.config) {
  process.stdout.write('Usage: node tools/mcp-smoke-test.mjs --config <mcp-config.json>\n');
  process.exit(0);
}

const configPath = resolve(options.config);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const registryPath = resolve('.narada/capabilities/mcp-surfaces.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

async function runSmokeTest() {
  const results = {};
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers ?? {})) {
    process.stdout.write(`Testing ${serverName}...\n`);
    results[serverName] = await testServer(serverName, serverConfig);
  }

  process.stdout.write('\n=== SUMMARY ===\n');
  let allPassed = true;
  for (const [serverName, result] of Object.entries(results)) {
    process.stdout.write(`${serverName}: ${result.passed ? 'PASS' : 'FAIL'}\n`);
    if (!result.passed) {
      allPassed = false;
      process.stdout.write(`  Errors: ${result.errors.join(', ')}\n`);
    }
  }
  process.exit(allPassed ? 0 : 1);
}

async function testServer(serverName, serverConfig) {
  const errors = [];
  const registrySurface = findRegistrySurface(serverName);
  const doctorTool = registrySurface ? resolveDoctorTool(registrySurface) : null;

  if (!registrySurface) errors.push(`No registry surface for ${serverName}`);

  const responses = [];
  let stderr = '';
  try {
    const child = spawnTestChild(serverConfig.command, serverConfig.args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    let buffer = '';
    child.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          responses.push(JSON.parse(line));
        } catch {
          errors.push(`Invalid JSON response: ${line.slice(0, 200)}`);
        }
      }
    });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    if (doctorTool) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: doctorTool, arguments: {} } })}\n`);
    }
    child.stdin.end();

    await waitForResponses(child, responses, doctorTool ? 3 : 2);
  } catch (error) {
    errors.push(`Test execution failed: ${error.message}`);
  }

  const initResponse = responses.find((r) => r.id === 1);
  const toolsListResponse = responses.find((r) => r.id === 2);
  const doctorResponse = responses.find((r) => r.id === 3);

  validateInitialize(initResponse, errors);
  const actualTools = validateToolsList(toolsListResponse, errors);
  if (doctorTool) validateDoctor(doctorResponse, doctorTool, errors);
  if (registrySurface) validateRegistryTools(registrySurface, actualTools, errors);
  if (stderr.trim()) errors.push(`stderr: ${stderr.trim().slice(0, 300)}`);

  return { passed: errors.length === 0, errors, doctor_tool: doctorTool };
}

function findRegistrySurface(serverName) {
  return (registry.surfaces ?? []).find((surface) => surface.client_config?.generated_path === `.ai/mcp/${serverName}.json`);
}

function resolveDoctorTool(surface) {
  const tools = surface.tool_contract?.exposed_tools ?? [];
  return tools.find((tool) => tool.endsWith('_doctor')) ?? tools.find((tool) => tool === 'doctor') ?? null;
}

function validateInitialize(response, errors) {
  if (!response) return errors.push('No initialize response received');
  if (response.error) return errors.push(`Initialize error: ${response.error.message}`);
  if (!response.result?.serverInfo?.name || !response.result?.serverInfo?.version) errors.push('initialize.serverInfo missing name or version');
  if (response.result?.serverInfo?.site_root || response.result?.serverInfo?.authority_posture) errors.push('initialize.serverInfo contains custom metadata');
}

function validateToolsList(response, errors) {
  if (!response) {
    errors.push('No tools/list response received');
    return [];
  }
  if (response.error) {
    errors.push(`tools/list error: ${response.error.message}`);
    return [];
  }
  const tools = response.result?.tools;
  if (!Array.isArray(tools)) {
    errors.push('tools/list response missing tools array');
    return [];
  }
  if (response.result?.authority_posture || response.result?.surface_type) errors.push('tools/list response contains custom metadata');
  return tools.map((tool) => tool.name).filter(Boolean);
}

function validateDoctor(response, doctorTool, errors) {
  if (!response) return errors.push(`No doctor response received for ${doctorTool}`);
  if (response.error) return errors.push(`Doctor error for ${doctorTool}: ${response.error.message}`);
  let doctorData;
  try {
    doctorData = JSON.parse(response.result.content[0].text);
  } catch (error) {
    errors.push(`Doctor response content is not valid JSON: ${error.message}`);
    return;
  }
  if (doctorData?.status !== 'ok') errors.push('Doctor response status not ok');
  if (!Array.isArray(doctorData?.canonical_tools)) errors.push('Doctor response missing canonical_tools array');
  if (!doctorData?.deprecated_aliases || typeof doctorData.deprecated_aliases !== 'object') errors.push('Doctor response missing deprecated_aliases object');
}

function validateRegistryTools(surface, actualTools, errors) {
  const registryTools = surface.tool_contract?.exposed_tools ?? [];
  const missingFromRegistry = actualTools.filter((tool) => !registryTools.includes(tool));
  const missingFromServer = registryTools.filter((tool) => !actualTools.includes(tool));
  if (missingFromRegistry.length > 0) errors.push(`Tools in server but not registry: ${missingFromRegistry.join(', ')}`);
  if (missingFromServer.length > 0) errors.push(`Tools in registry but not server: ${missingFromServer.join(', ')}`);
}

function waitForResponses(child, responses, expectedResponses) {
  return new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (!child.killed) child.kill();
      resolvePromise();
    }, 5000);
    child.stdout.on('data', () => {
      if (responses.length >= expectedResponses) {
        clearTimeout(timeout);
        if (!child.killed) child.kill();
        resolvePromise();
      }
    });
    child.on('close', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      parsed.config = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      parsed.help = true;
    }
  }
  return parsed;
}

runSmokeTest().catch((error) => {
  process.stderr.write(`Smoke test failed: ${error.message}\n`);
  process.exit(1);
});
