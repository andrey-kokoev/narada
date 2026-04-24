/**
 * Task graph inspection operator.
 *
 * Read-only rendering of `.ai/tasks` as Mermaid or JSON.
 * Pure inspection — no mutations to task files, roster, reports, reviews, or registry.
 *
 * Operator viewing path:
 *   --view              Creates .mmd + .html artifacts and opens browser
 *   --view --no-open    Creates artifacts without opening browser
 *   --format mermaid    Raw Mermaid to stdout (pipe/machine/inspection)
 *   --format json       Raw JSON to stdout (pipe/machine/inspection)
 */

import { resolve } from 'node:path';
import { readTaskGraph, renderMermaid, renderJson, type ReadTaskGraphOptions } from '../lib/task-graph.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { renderAndMaybeOpen } from '../lib/browser-render.js';

export interface TaskGraphOptions {
  format?: 'mermaid' | 'json' | 'auto';
  range?: string;
  status?: string;
  includeClosed?: boolean;
  cwd?: string;
  /** Create render artifacts and open browser (operator viewing path) */
  view?: boolean;
  /** Open browser after creating artifacts (default true when --view is set) */
  open?: boolean;
}

export async function taskGraphCommand(
  options: TaskGraphOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const isJsonFormat = options.format === 'json';
  const fmt = createFormatter({ format: isJsonFormat ? 'json' : 'human', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const readOpts: ReadTaskGraphOptions = {
    cwd,
    includeClosed: options.includeClosed,
  };

  if (options.range) {
    const rangeMatch = options.range.match(/^(\d+)-(\d+)$/);
    if (!rangeMatch) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Invalid range format: ${options.range}. Expected: start-end` },
      };
    }
    readOpts.range = {
      start: Number(rangeMatch[1]),
      end: Number(rangeMatch[2]),
    };
  }

  if (options.status) {
    readOpts.statusFilter = options.status.split(',').map((s) => s.trim());
  }

  let graph;
  try {
    graph = await readTaskGraph(readOpts);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to read task graph: ${msg}` },
    };
  }

  const outputFormat = options.format === 'json' ? 'json' : 'mermaid';

  // Operator viewing path: --view creates artifacts and opens browser
  if (options.view) {
    const mermaid = renderMermaid(graph);
    const shouldOpen = options.open !== false;
    const renderResult = await renderAndMaybeOpen(
      mermaid,
      `Task Graph (${graph.nodes.length} nodes)`,
      shouldOpen,
    );

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          view: true,
          opened: renderResult.opened,
          artifact_dir: renderResult.artifactDir,
          mermaid_path: renderResult.mermaidPath,
          html_path: renderResult.htmlPath,
          message: renderResult.message,
        },
      };
    }

    fmt.section('Task Graph View');
    fmt.message(renderResult.message, renderResult.opened ? 'success' : 'info');
    fmt.kv('Mermaid source', renderResult.mermaidPath);
    fmt.kv('HTML render', renderResult.htmlPath);

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        view: true,
        opened: renderResult.opened,
        artifact_dir: renderResult.artifactDir,
        mermaid_path: renderResult.mermaidPath,
        html_path: renderResult.htmlPath,
        message: renderResult.message,
      },
    };
  }

  if (outputFormat === 'json') {
    const jsonGraph = renderJson(graph);
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', nodes: jsonGraph.nodes, edges: jsonGraph.edges },
    };
  }

  // Mermaid is the default human-readable output
  const mermaid = renderMermaid(graph);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', mermaid },
    };
  }

  if (graph.nodes.length === 0) {
    fmt.message('No tasks match the current filters', 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', count: 0, mermaid: '' },
    };
  }

  fmt.section(`Task Graph (${graph.nodes.length} nodes, ${graph.edges.length} edges)`);
  console.log('```mermaid');
  console.log(mermaid.trimEnd());
  console.log('```');

  return {
    exitCode: ExitCode.SUCCESS,
    result: { status: 'success', count: graph.nodes.length, mermaid },
  };
}
