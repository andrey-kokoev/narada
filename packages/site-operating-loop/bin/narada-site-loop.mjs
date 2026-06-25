#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  admitLoopTrigger,
  getLoopHealth,
  getLoopRun,
  getLoopStatus,
  listLoopRuntimeEvents,
  listLoopRuns,
  listLoopTriggers,
  setLoopControl,
} from '../src/site-loop-store.mjs';
import { startSiteOperatingLoopRuntime } from '../src/runtime.mjs';
import { createSiteOperatingLoopHttpServer, listenSiteOperatingLoopHttpServer } from '../src/server.mjs';
import { resolveSiteOperatingLoopModule } from '../src/loop-module.mjs';

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? 'status';

if (command === 'help') {
  console.log(JSON.stringify(helpResult(), null, 2));
  process.exit(0);
}

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
  } else if (command === 'health') {
    result = getLoopHealth(store, args.loopId);
  } else if (command === 'events') {
    result = listLoopRuntimeEvents(store, {
      loopId: args.loopId,
      afterEventId: args.afterEventId ?? null,
      limit: Number(args.limit ?? 50),
    });
  } else if (command === 'triggers') {
    result = listLoopTriggers(store, {
      loopId: args.loopId,
      status: args.status ?? null,
      limit: Number(args.limit ?? 50),
    });
  } else if (command === 'trigger') {
    if (!args.kind) fail('missing_required_arg: --kind <kind>');
    result = admitLoopTrigger(store, {
      loopId: args.loopId,
      kind: args.kind,
      source: args.source ?? 'operator_cli',
      sourceRef: args.sourceRef ?? null,
      payload: parseJsonArg(args.payloadJson, null),
    });
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
  } else if (command === 'run') {
    if (!args.loopModule) fail('missing_required_arg: --loop-module <module>');
    const loopContract = await loadLoopModule(args.loopModule);
    const jsonlEvents = Boolean(args.jsonlEvents);
    result = await startSiteOperatingLoopRuntime(store, {
      loopId: args.loopId,
      ownerId: args.ownerId ?? undefined,
      dryRun: Boolean(args.dryRun),
      intervalMs: Number(args.intervalMs ?? 60_000),
      lockTtlMs: Number(args.lockTtlMs ?? 5 * 60_000),
      maxCycles: args.forever ? 'forever' : Number(args.maxCycles ?? (args.once ? 1 : 1)),
      prepareRun: loopContract.prepareRun,
      createSteps: (context) => loopContract.createSteps({
        ...context,
        siteRoot: args.siteRoot ?? process.cwd(),
        args,
      }),
      summarize: loopContract.summarize,
      onEvent: jsonlEvents ? (event) => console.log(JSON.stringify(event)) : null,
    });
  } else if (command === 'supervise') {
    if (!args.loopModule) fail('missing_required_arg: --loop-module <module>');
    const loopContract = await loadLoopModule(args.loopModule);
    const jsonlEvents = Boolean(args.jsonlEvents);
    const abortController = new AbortController();
    const stop = () => abortController.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const server = createSiteOperatingLoopHttpServer(store, {
      loopId: args.loopId,
      allowOrigin: args.allowOrigin ?? null,
    });
    const serverStatus = await listenSiteOperatingLoopHttpServer(server, {
      host: args.host ?? '127.0.0.1',
      port: Number(args.port ?? 0),
    });
    if (jsonlEvents) {
      console.log(JSON.stringify({
        schema: 'narada.site_operating_loop.supervisor_started.v1',
        status: 'started',
        loop_id: args.loopId,
        server: serverStatus,
        runtime: {
          owner_id: args.ownerId ?? 'site-operating-loop',
          dry_run: Boolean(args.dryRun),
          interval_ms: Number(args.intervalMs ?? 60_000),
          lock_ttl_ms: Number(args.lockTtlMs ?? 5 * 60_000),
          max_cycles: args.forever || (!args.once && args.maxCycles == null) ? null : Number(args.maxCycles ?? 1),
        },
      }));
    }
    let runtime;
    try {
      runtime = await startSiteOperatingLoopRuntime(store, {
        loopId: args.loopId,
        ownerId: args.ownerId ?? undefined,
        dryRun: Boolean(args.dryRun),
        intervalMs: Number(args.intervalMs ?? 60_000),
        lockTtlMs: Number(args.lockTtlMs ?? 5 * 60_000),
        maxCycles: args.forever || (!args.once && args.maxCycles == null) ? 'forever' : Number(args.maxCycles ?? 1),
        prepareRun: loopContract.prepareRun,
        createSteps: (context) => loopContract.createSteps({
          ...context,
          siteRoot: args.siteRoot ?? process.cwd(),
          args,
        }),
        summarize: loopContract.summarize,
        signal: abortController.signal,
        onEvent: jsonlEvents ? (event) => console.log(JSON.stringify(event)) : null,
      });
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      server.close();
    }
    result = {
      schema: 'narada.site_operating_loop.supervisor.v1',
      status: runtime.status,
      loop_id: args.loopId,
      server: serverStatus,
      runtime,
    };
  } else if (command === 'serve') {
    const server = createSiteOperatingLoopHttpServer(store, {
      loopId: args.loopId,
      allowOrigin: args.allowOrigin ?? null,
    });
    result = await listenSiteOperatingLoopHttpServer(server, {
      host: args.host ?? '127.0.0.1',
      port: Number(args.port ?? 0),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!args.once) await new Promise(() => {});
    server.close();
    process.exit(0);
  } else {
    result = helpResult();
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
    else if (arg === '--loop-module') parsed.loopModule = argv[++i];
    else if (arg === '--site-root') parsed.siteRoot = argv[++i];
    else if (arg === '--loop-id') parsed.loopId = argv[++i];
    else if (arg === '--run-id') parsed.runId = argv[++i];
    else if (arg === '--owner-id') parsed.ownerId = argv[++i];
    else if (arg === '--kind') parsed.kind = argv[++i];
    else if (arg === '--source') parsed.source = argv[++i];
    else if (arg === '--source-ref') parsed.sourceRef = argv[++i];
    else if (arg === '--payload-json') parsed.payloadJson = argv[++i];
    else if (arg === '--status') parsed.status = argv[++i];
    else if (arg === '--host') parsed.host = argv[++i];
    else if (arg === '--port') parsed.port = argv[++i];
    else if (arg === '--allow-origin') parsed.allowOrigin = argv[++i];
    else if (arg === '--after-event-id') parsed.afterEventId = argv[++i];
    else if (arg === '--limit') parsed.limit = argv[++i];
    else if (arg === '--reason') parsed.reason = argv[++i];
    else if (arg === '--interval-ms') parsed.intervalMs = argv[++i];
    else if (arg === '--lock-ttl-ms') parsed.lockTtlMs = argv[++i];
    else if (arg === '--max-cycles') parsed.maxCycles = argv[++i];
    else if (arg === '--once') parsed.once = true;
    else if (arg === '--forever') parsed.forever = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--jsonl-events') parsed.jsonlEvents = true;
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

async function loadLoopModule(loopModulePath) {
  const loopModule = await import(pathToFileURL(loopModulePath).href);
  const contract = resolveSiteOperatingLoopModule(loopModule, { moduleRef: loopModulePath });
  if (contract.status !== 'ok') fail(`invalid_loop_module_contract: ${contract.errors.join(',')}`);
  return contract;
}

function helpResult() {
  return {
    schema: 'narada.site_operating_loop.cli_help.v1',
    commands: ['status', 'health', 'events', 'triggers', 'trigger', 'list', 'show', 'pause', 'resume', 'run', 'serve', 'supervise'],
    required: ['--store-module', '--loop-id'],
    run_required: ['--loop-module'],
    trigger_required: ['--kind'],
  };
}

function parseJsonArg(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    fail('invalid_json_arg: --payload-json');
  }
}
