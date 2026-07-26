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

const options: any = parseArgs(process.argv.slice(2));

if (options.help || !options.config) {
  process.stdout.write('Usage: node tools/mcp-smoke-test.ts --config <mcp-config.json>\n');
  process.exit(0);
}

const configPath: any = resolve(options.config);
const config: any = JSON.parse(readFileSync(configPath, 'utf8'));
const registryPath: any = resolve('.narada/capabilities/mcp-surfaces.json');
const registry: any = JSON.parse(readFileSync(registryPath, 'utf8'));

async function runSmokeTest() : Promise<any>{
  const results: any = {};
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers ?? {})) {
    process.stdout.write(`Testing ${serverName}...\n`);
    results[serverName] = await testServer(serverName, serverConfig);
  }

  process.stdout.write('\n=== SUMMARY ===\n');
  let allPassed: any = true;
  for (const [serverName, result] of Object.entries(results) as Array<[string, any]>) {
    process.stdout.write(`${serverName}: ${result.passed ? 'PASS' : 'FAIL'}\n`);
    if (!result.passed) {
      allPassed = false;
      process.stdout.write(`  Errors: ${result.errors.join(', ')}\n`);
    }
  }
  process.exit(allPassed ? 0 : 1);
}

async function testServer(serverName: any, serverConfig: any) : Promise<any>{
  const errors: any = [];
  const registrySurface: any = findRegistrySurface(serverName);
  const doctorTool: any = registrySurface ? resolveDoctorTool(registrySurface) : null;

  if (!registrySurface) errors.push(`No registry surface for ${serverName}`);

  const responses: any = [];
  let stderr: any = '';
  try {
    const child: any = spawnTestChild(serverConfig.command, serverConfig.args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    let buffer: any = '';
    child.stdout.on('data', (data: any) => {
      buffer += data.toString();
      const lines: any = buffer.split(/\r?\n/);
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
    child.stderr.on('data', (data: any) => { stderr += data.toString(); });

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    if (doctorTool) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: doctorTool, arguments: {} } })}\n`);
    }
    child.stdin.end();

    await waitForResponses(child, responses, doctorTool ? 3 : 2);
  } catch (error: any) {
    errors.push(`Test execution failed: ${error.message}`);
  }

  const initResponse: any = responses.find((r: any) => r.id === 1);
  const toolsListResponse: any = responses.find((r: any) => r.id === 2);
  const doctorResponse: any = responses.find((r: any) => r.id === 3);

  validateInitialize(initResponse, errors);
  const actualTools: any = validateToolsList(toolsListResponse, errors);
  if (doctorTool) validateDoctor(doctorResponse, doctorTool, errors);
  if (registrySurface) validateRegistryTools(registrySurface, actualTools, errors);
  if (stderr.trim()) errors.push(`stderr: ${stderr.trim().slice(0, 300)}`);

  return { passed: errors.length === 0, errors, doctor_tool: doctorTool };
}

function findRegistrySurface(serverName: any) : any{
  return (registry.surfaces ?? []).find((surface: any) => surface.client_config?.generated_path === `.ai/mcp/${serverName}.json`);
}

function resolveDoctorTool(surface: any) : any{
  const tools: any = surface.tool_contract?.exposed_tools ?? [];
  return tools.find((tool: any) => tool.endsWith('_doctor')) ?? tools.find((tool: any) => tool === 'doctor') ?? null;
}

function validateInitialize(response: any, errors: any) : any{
  if (!response) return errors.push('No initialize response received');
  if (response.error) return errors.push(`Initialize error: ${response.error.message}`);
  if (!response.result?.serverInfo?.name || !response.result?.serverInfo?.version) errors.push('initialize.serverInfo missing name or version');
  if (response.result?.serverInfo?.site_root || response.result?.serverInfo?.authority_posture) errors.push('initialize.serverInfo contains custom metadata');
}

function validateToolsList(response: any, errors: any) : any{
  if (!response) {
    errors.push('No tools/list response received');
    return [];
  }
  if (response.error) {
    errors.push(`tools/list error: ${response.error.message}`);
    return [];
  }
  const tools: any = response.result?.tools;
  if (!Array.isArray(tools)) {
    errors.push('tools/list response missing tools array');
    return [];
  }
  if (response.result?.authority_posture || response.result?.surface_type) errors.push('tools/list response contains custom metadata');
  return tools.map((tool: any) => tool.name).filter(Boolean);
}

function validateDoctor(response: any, doctorTool: any, errors: any) : any{
  if (!response) return errors.push(`No doctor response received for ${doctorTool}`);
  if (response.error) return errors.push(`Doctor error for ${doctorTool}: ${response.error.message}`);
  let doctorData: any;
  try {
    doctorData = JSON.parse(response.result.content[0].text);
  } catch (error: any) {
    errors.push(`Doctor response content is not valid JSON: ${error.message}`);
    return;
  }
  if (doctorData?.status !== 'ok') errors.push('Doctor response status not ok');
  if (!Array.isArray(doctorData?.canonical_tools)) errors.push('Doctor response missing canonical_tools array');
  if (!doctorData?.deprecated_aliases || typeof doctorData.deprecated_aliases !== 'object') errors.push('Doctor response missing deprecated_aliases object');
}

function validateRegistryTools(surface: any, actualTools: any, errors: any) : any{
  const registryTools: any = surface.tool_contract?.exposed_tools ?? [];
  const missingFromRegistry: any = actualTools.filter((tool: any) => !registryTools.includes(tool));
  const missingFromServer: any = registryTools.filter((tool: any) => !actualTools.includes(tool));
  if (missingFromRegistry.length > 0) errors.push(`Tools in server but not registry: ${missingFromRegistry.join(', ')}`);
  if (missingFromServer.length > 0) errors.push(`Tools in registry but not server: ${missingFromServer.join(', ')}`);
}

function waitForResponses(child: any, responses: any, expectedResponses: any) : any{
  return new Promise((resolvePromise: any) => {
    const timeout: any = setTimeout(() => {
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

function parseArgs(args: any) : any{
  const parsed: any = {};
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

runSmokeTest().catch((error: any) => {
  process.stderr.write(`Smoke test failed: ${error.message}\n`);
  process.exit(1);
});
