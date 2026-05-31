#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  getLoopRun,
  getLoopStatus,
  listLoopRuns,
  setLoopControl,
} from '../src/site-loop-store.mjs';

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? 'status';

if (!args.storeModule) {
  fail('missing_required_arg: --store-module <module>');
}
if (!args.loopId && !['help'].includes(command)) {
  fail('missing_required_arg: --loop-id <loop-id>');
}

const storeModule = await import(pathToFileURL(args.storeModule).href);
if (typeof storeModule.openSiteLoopStore !== 'function') {
  fail('store_module_missing_openSiteLoopStore');
}

const store = storeModule.openSiteLoopStore(args.siteRoot ?? process.cwd());
try {
  let result;
  if (command === 'status') {
    result = getLoopStatus(store, { loopId: args.loopId });
  } else if (command === 'list') {
    result = {
      schema: 'narada.site_operating_loop.runs.v1',
      loop_id: args.loopId,
      runs: listLoopRuns(store, { loopId: args.loopId, limit: Number(args.limit ?? 10) }),
    };
  } else if (command === 'show') {
    result = {
      schema: 'narada.site_operating_loop.run_show.v1',
      status: 'ok',
      run: getLoopRun(store, args.runId),
    };
    if (!args.runId) result = { ...result, status: 'refused', reason: 'run_id_required' };
  } else if (command === 'pause') {
    result = setLoopControl(store, {
      loopId: args.loopId,
      paused: true,
      mode: 'paused',
      reason: args.reason ?? 'operator_requested',
    });
  } else if (command === 'resume') {
    result = setLoopControl(store, {
      loopId: args.loopId,
      paused: false,
      mode: 'running',
      reason: args.reason ?? 'operator_requested',
    });
  } else {
    result = {
      schema: 'narada.site_operating_loop.cli_help.v1',
      commands: ['status', 'list', 'show', 'pause', 'resume'],
      required: ['--store-module', '--loop-id'],
    };
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.close?.();
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--store-module') parsed.storeModule = argv[++i];
    else if (arg === '--site-root') parsed.siteRoot = argv[++i];
    else if (arg === '--loop-id') parsed.loopId = argv[++i];
    else if (arg === '--run-id') parsed.runId = argv[++i];
    else if (arg === '--limit') parsed.limit = argv[++i];
    else if (arg === '--reason') parsed.reason = argv[++i];
    else parsed._.push(arg);
  }
  return parsed;
}

function fail(reason) {
  console.error(JSON.stringify({
    schema: 'narada.site_operating_loop.cli_error.v1',
    status: 'refused',
    reason,
  }, null, 2));
  process.exit(2);
}
