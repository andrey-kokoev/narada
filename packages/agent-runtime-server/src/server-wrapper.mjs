import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createProjectedTerminalBridge } from '@narada2/agent-cli/projected-terminal';
import {
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
  formatSessionOperationsEvent,
  formatSessionOperationsSummary,
  formatSessionWorkflowEvent,
  formatSessionWorkflowSummary,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
} from '@narada2/agent-cli/runtime-server-events';
import {
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
} from './lifecycle-hooks.mjs';

const require = createRequire(import.meta.url);

function agentCliBinPath() {
  const packageJsonPath = require.resolve('@narada2/agent-cli/package.json');
  return join(dirname(packageJsonPath), 'bin', 'narada-agent-cli.mjs');
}

function renderWrapperEvents({ event, wrapperEventsJsonl, state }) {
  if (wrapperEventsJsonl) {
    const statusEvent = formatWrapperStatusEvent(event);
    if (statusEvent) console.error(JSON.stringify(statusEvent));
  }
  const summary = formatStartupMcpSummary(event);
  if (summary && !state.startupSummaryPrinted) {
    console.error(summary);
    if (wrapperEventsJsonl) {
      const wrapperEvent = formatStartupMcpEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.startupSummaryPrinted = true;
  }
  const runtimeFaultSummary = formatRuntimeMcpFaultSummary(event);
  if (runtimeFaultSummary && !state.runtimeFaultSummaries.has(runtimeFaultSummary)) {
    console.error(runtimeFaultSummary);
    if (wrapperEventsJsonl) {
      const wrapperEvent = formatRuntimeMcpFaultEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.runtimeFaultSummaries.add(runtimeFaultSummary);
  }
  for (const [workflowSummary, wrapperEvent] of [
    [formatSessionWorkflowSummary(event), formatSessionWorkflowEvent(event)],
    [formatSessionOperationsSummary(event), formatSessionOperationsEvent(event)],
    [formatPreflightWorkflowSummary(event), formatPreflightWorkflowEvent(event)],
  ]) {
    if (!workflowSummary || state.workflowSummaries.has(workflowSummary)) continue;
    console.error(workflowSummary);
    if (wrapperEventsJsonl && wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    state.workflowSummaries.add(workflowSummary);
  }
}

async function main() {
  const requestedArgs = process.argv.slice(2);
  const wrapperEventsJsonl = requestedArgs.includes('--wrapper-events-jsonl');
  const rawJsonl = requestedArgs.includes('--raw-jsonl');
  const forwardedArgs = requestedArgs.filter((arg) => arg !== '--wrapper-events-jsonl' && arg !== '--raw-jsonl');
  const args = forwardedArgs.includes('--server') ? forwardedArgs : ['--server', ...forwardedArgs];
  const lifecycleDispatcher = createNarsLifecycleHookDispatcher();
  const lifecycleBinding = lifecycleBindingFromArgs(args, process.env);
  try {
    const result = await dispatchNarsLifecycleHook(lifecycleDispatcher, 'beforeSessionBind', lifecycleBinding);
    for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
  } catch (error) {
    console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const child = spawn(process.execPath, [agentCliBinPath(), ...args], {
    stdio: [rawJsonl ? 'inherit' : 'pipe', 'pipe', 'pipe'],
    env: process.env,
    cwd: process.cwd(),
    windowsHide: false,
  });

  const state = {
    startupSummaryPrinted: false,
    runtimeFaultSummaries: new Set(),
    workflowSummaries: new Set(),
  };
  let stdoutBuffer = '';
  let writeProjectedOutput = (text) => process.stdout.write(text);
  let renderProjectedEvent = () => [];

  if (!rawJsonl) {
    const projectedTerminal = createProjectedTerminalBridge({
      input: process.stdin,
      output: process.stdout,
      childStdin: child.stdin,
    });
    writeProjectedOutput = projectedTerminal.writeProjectedOutput;
    renderProjectedEvent = projectedTerminal.renderEvent;
  }
  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    if (rawJsonl) process.stdout.write(text);
    stdoutBuffer += text;
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex === -1) break;
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        dispatchNarsLifecycleHooksForEvent(lifecycleDispatcher, event)
          .then((result) => {
            for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
          })
          .catch((error) => console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`));
        if (!rawJsonl) {
          for (const rendered of renderProjectedEvent(event)) {
            if (typeof rendered === 'string') {
              writeProjectedOutput(`${rendered}\n`, { preserveCurrentLine: rendered.startsWith('\n') });
            } else if (rendered?.raw) {
              writeProjectedOutput(rendered.raw, { preserveCurrentLine: rendered.raw.startsWith('\n'), prompt: rendered.newline !== false });
              if (rendered.newline) writeProjectedOutput('\n', { preserveCurrentLine: true });
            }
          }
        }
        renderWrapperEvents({ event, wrapperEventsJsonl, state });
      } catch {}
    }
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(String(chunk));
  });

  child.on('error', (error) => {
    console.error(`[agent-runtime-server] failed to start carrier: ${error.message}`);
    process.exit(1);
  });

  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(typeof code === 'number' ? code : 1));
  });
  process.exit(exitCode);
}

export {
  agentCliBinPath,
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
  formatSessionOperationsEvent,
  formatSessionOperationsSummary,
  formatSessionWorkflowEvent,
  formatSessionWorkflowSummary,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
  main,
};
