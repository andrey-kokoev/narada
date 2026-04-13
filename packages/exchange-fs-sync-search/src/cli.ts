#!/usr/bin/env node
/**
 * exchange-fs-sync-search CLI
 * 
 * Full-text search CLI for exchange-fs-sync messages.
 */

import { join } from 'node:path';
import { loadConfig } from '@narada/exchange-fs-sync';
import { SearchEngine } from './search-engine.js';
import type { SearchQuery } from './types.js';

interface CliArgs {
  command: 'build' | 'search' | 'stats' | 'help';
  configPath: string;
  query?: string;
  folder?: string;
  limit?: number;
  offset?: number;
  unread?: boolean;
  flagged?: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    return { command: 'help', configPath: './config.json' };
  }

  const command = args[0] as CliArgs['command'];
  const configPath = process.env.CONFIG_PATH || './config.json';
  
  const result: CliArgs = { command, configPath };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '--config':
      case '-c':
        result.configPath = next;
        i++;
        break;
      case '--query':
      case '-q':
        result.query = next;
        i++;
        break;
      case '--folder':
        result.folder = next;
        i++;
        break;
      case '--limit':
      case '-n':
        result.limit = parseInt(next, 10);
        i++;
        break;
      case '--offset':
      case '-o':
        result.offset = parseInt(next, 10);
        i++;
        break;
      case '--unread':
      case '-u':
        result.unread = true;
        break;
      case '--flagged':
        result.flagged = true;
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
exchange-fs-sync-search - Full-text search for mailbox messages

USAGE:
  exchange-fs-sync-search <command> [options]

COMMANDS:
  build              Build search index from messages
  search <query>     Search messages
  stats              Show index statistics
  help               Show this help

OPTIONS:
  -c, --config <path>    Config file path (default: ./config.json)
  -q, --query <text>     Search query
  --folder <ref>         Filter by folder
  -n, --limit <num>      Max results (default: 20)
  -o, --offset <num>     Result offset for pagination
  -u, --unread           Only unread messages
  --flagged              Only flagged messages

QUERY SYNTAX (FTS5):
  word1 word2         Both words (AND)
  "exact phrase"      Exact match
  word1 OR word2      Either word
  word1 -word2        word1 NOT word2
  word*               Prefix match
  subject:word        Search subject only
  from:john           Search from field only

ENVIRONMENT:
  CONFIG_PATH            Default config path

EXAMPLES:
  # Build index
  exchange-fs-sync-search build

  # Search for "meeting"
  exchange-fs-sync-search search "meeting"

  # Search with filters
  exchange-fs-sync-search search -q "project" -u --folder inbox

  # Boolean search
  exchange-fs-sync-search search "urgent OR (meeting -cancelled)"
`);
}

async function buildIndex(configPath: string): Promise<void> {
  console.log('[search] Loading config...');
  const config = await loadConfig({ path: configPath });
  
  const messagesDir = join(config.root_dir, 'messages');
  
  const engine = new SearchEngine({
    rootDir: config.root_dir,
  });

  try {
    console.log('[search] Building index...');
    const stats = await engine.build(messagesDir);
    
    console.log('[search] Index built:');
    console.log(`  Documents: ${stats.documents_indexed}`);
    console.log(`  Terms: ${stats.terms_indexed}`);
    console.log(`  Added: ${stats.details.added}`);
    console.log(`  Updated: ${stats.details.updated}`);
    console.log(`  Removed: ${stats.details.removed}`);
  } finally {
    engine.close();
  }
}

async function search(args: CliArgs): Promise<void> {
  if (!args.query) {
    console.error('Error: --query is required for search');
    process.exit(1);
  }

  console.log('[search] Loading config...');
  const config = await loadConfig({ path: args.configPath });
  
  const engine = new SearchEngine({
    rootDir: config.root_dir,
  });

  try {
    console.log('[search] Loading index...');
    const exists = engine.indexExists();
    if (!exists) {
      console.error('Error: No search index found. Run "build" first.');
      process.exit(1);
    }

    const query: SearchQuery = {
      q: args.query,
      limit: args.limit || 20,
      offset: args.offset || 0,
    };

    if (args.folder) {
      query.folder_refs = [args.folder];
    }
    if (args.unread !== undefined) {
      query.is_read = false;
    }
    if (args.flagged !== undefined) {
      query.is_flagged = true;
    }

    console.log(`[search] Searching: "${args.query}"`);
    const startTime = Date.now();
    const results = engine.search(query);
    const totalCount = engine.count(query);
    const duration = Date.now() - startTime;

    console.log(`[search] Found ${totalCount} results (showing ${results.length}) in ${duration}ms`);
    console.log();

    for (const result of results) {
      const doc = engine.getDocument(result.message_id);
      if (!doc) continue;

      console.log(`─`.repeat(60));
      console.log(`Score: ${result.score.toFixed(2)} | ID: ${result.message_id}`);
      console.log(`From: ${doc.from_name} <${doc.from_email}>`);
      console.log(`Date: ${doc.received_at}`);
      
      for (const highlight of result.highlights) {
        if (highlight.field === 'subject') {
          console.log(`Subject: ${highlight.snippet}`);
        } else if (highlight.field === 'body') {
          console.log(`Body: ${highlight.snippet}`);
        }
      }
      console.log();
    }
  } finally {
    engine.close();
  }
}

async function showStats(configPath: string): Promise<void> {
  const config = await loadConfig({ path: configPath });
  
  const engine = new SearchEngine({
    rootDir: config.root_dir,
  });

  try {
    const stats = engine.getStats();
    
    if (!stats.index_exists) {
      console.log('No index found. Run "build" to create one.');
      return;
    }

    console.log('Index Statistics:');
    console.log(`  Documents: ${stats.documents_indexed}`);
    console.log(`  Unique terms: ${stats.terms_indexed}`);
  } finally {
    engine.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  try {
    switch (args.command) {
      case 'help':
        printHelp();
        break;
      case 'build':
        await buildIndex(args.configPath);
        break;
      case 'search':
        await search(args);
        break;
      case 'stats':
        await showStats(args.configPath);
        break;
      default:
        console.error(`Unknown command: ${args.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('[search] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
