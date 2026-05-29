#!/usr/bin/env node
import { resolve } from 'node:path';
import { listAgentStartSessions, openAgentContextDb } from './session-start.mjs';

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      args.positional.push(arg);
      continue;
    }
    const key = arg.slice(2).replace(/-/g, '_');
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printHuman(result) {
  console.log(`agent sessions: ${result.session_count}`);
  for (const session of result.sessions) {
    const seconds = session.duration_estimate.seconds;
    const duration = seconds === null ? 'unknown duration' : `${seconds}s estimated`;
    console.log(`${session.created_at}  ${session.identity}  ${session.substrate}  ${session.event_id}  ${duration}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const siteRoot = resolve(args.site_root ?? args.positional[0] ?? process.cwd());
const db = openAgentContextDb(siteRoot);
try {
  const result = listAgentStartSessions({
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
