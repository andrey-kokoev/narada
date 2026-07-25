#!/usr/bin/env node
import { resolve } from 'node:path';
import { listAgentStartSessions, openAgentContextDb } from './session-start.js';

function parseArgs(argv: any) {
  const args: any = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg: any = argv[i];
    if (!arg.startsWith('--')) {
      args.positional.push(arg);
      continue;
    }
    const key: any = arg.slice(2).replace(/-/g, '_');
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printHuman(result: any) {
  console.log(`agent sessions: ${result.session_count}`);
  for (const session of result.sessions) {
    const seconds: any = session.duration_estimate.seconds;
    const duration: any = seconds === null ? 'unknown duration' : `${seconds}s estimated`;
    console.log(`${session.created_at}  ${session.identity}  ${session.substrate}  ${session.event_id}  ${duration}`);
  }
}

const args: any = parseArgs(process.argv.slice(2));
const siteRoot: any = resolve(args.site_root ?? args.positional[0] ?? process.cwd());
const db: any = (openAgentContextDb as any)(siteRoot);
try {
  const result: any = (listAgentStartSessions as any)({
    db,
    identity: args.identity ?? args.agent ?? null,
    dateFrom: args.date_from ?? args.from ?? null,
    dateTo: args.date_to ?? args.to ?? null,
    substrate: args.substrate ?? args.runtime ?? null,
    limit: args.limit ?? 100,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
} finally {
  db.close();
}
