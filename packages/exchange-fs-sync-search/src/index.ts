#!/usr/bin/env node
/**
 * exchange-fs-sync-search
 * 
 * Full-text search CLI for exchange-fs-sync messages.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from 'exchange-fs-sync/src/config/load.js';
import { SearchEngine } from './query.js';
import type { SearchQuery } from './types.js';

interface CliArgs {
  command: 'build' | 'search' | 'stats' | 'help';
  configPath: string;
  query?: string;
  fields?: string;
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
      case '--fields':
      case '-f':
        result.fields = next;
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

Usage:
  exchange-fs-sync-search <command> [options]

Commands:
  build              Build search index from messages
  search <query>     Search messages
  stats              Show index statistics
  help               Show this help

Options:
  -c, --config <path>    Config file path (default: ./config.json)
  -q, --query <text>     Search query (required for search)
  -f, --fields <list>    Fields to search: subject,body,from,to (comma-separated)
  --folder <ref>         Filter by folder
  -n, --limit <num>      Max results (default: 20)
  -o, --offset <num>     Result offset for pagination
  -u, --unread           Only unread messages
  --flagged              Only flagged messages

Environment:
  CONFIG_PATH            Default config path

Examples:
  # Build index
  exchange-fs-sync-search build

  # Search for "meeting"
  exchange-fs-sync-search search meeting

  # Search subject only, unread only
  exchange-fs-sync-search search -q "urgent" -f subject -u

  # Search with folder filter
  exchange-fs-sync-search search -q "project" --folder inbox
`);
}

async function buildIndex(configPath: string): Promise<void> {
  console.log('[search] Loading config...');
  const config = await loadConfig({ path: configPath });
  
  const messagesDir = join(config.root_dir, 'messages');
  
  const engine = new SearchEngine({
    rootDir: config.root_dir,
  });

  console.log('[search] Building index...');
  const stats = await engine.build(messagesDir);
  
  console.log('[search] Index built:');
  console.log(`  Documents: ${stats.documents_indexed}`);
  console.log(`  Terms: ${stats.terms_indexed}`);
  console.log(`  Size: ${(stats.index_size_bytes / 1024).toFixed(1)} KB`);
  console.log(`  Duration: ${stats.build_duration_ms}ms`);
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

  console.log('[search] Loading index...');
  const loaded = await engine.load();
  if (!loaded) {
    console.error('Error: No search index found. Run "build" first.');
    process.exit(1);
  }

  const query: SearchQuery = {
    q: args.query,
    limit: args.limit || 20,
    offset: args.offset || 0,
  };

  if (args.fields) {
    query.fields = args.fields.split(',') as SearchQuery['fields'];
  }
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
  const duration = Date.now() - startTime;

  console.log(`[search] Found ${results.length} results (${duration}ms)`);
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
}

async function showStats(configPath: string): Promise<void> {
  const config = await loadConfig({ path: configPath });
  
  const engine = new SearchEngine({
    rootDir: config.root_dir,
  });

  const loaded = await engine.load();
  if (!loaded) {
    console.log('No index found. Run "build" to create one.');
    return;
  }

  const stats = await engine.getStats();
  
  console.log('Index Statistics:');
  console.log(`  Documents: ${stats.documents_indexed}`);
  console.log(`  Unique terms: ${stats.terms_indexed}`);
  console.log(`  Index size: ${(stats.index_size_bytes / 1024).toFixed(1)} KB`);
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
