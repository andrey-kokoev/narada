#!/usr/bin/env node
/**
 * doctrinal-reground.mjs
 *
 * Rehydrate Narada doctrinal posture from local files.
 * Reads key doctrinal documents and returns a compact structured summary.
 *
 * Usage:
 *   node tools/agent-context/doctrinal-reground.mjs [--format json|markdown]
 *
 * When the WSL thoughts corpus is available, operators should prefer
 * reading the full concepts there. This script is the canonical Windows
 * fallback for agent rehydration after context compaction.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DOCTRINAL_SOURCES = [
  {
    path: 'AGENTS.md',
    label: 'Agent Operating Posture',
    sections: ['Doctrine Absorption', 'Default Posture', 'Loci', 'Inbox Routing', 'Operator Surface Binding', 'Task Lifecycle Authority'],
  },
  {
    path: 'docs/concepts/doctrinal-review-template.md',
    label: 'Doctrinal Review Protocol',
    sections: ['CCC Coordinate Grid', 'Per-Doctrine 3-Question Checklist', 'Summary', 'Output Disposition'],
  },
  {
    path: 'docs/concepts/intelligence-context.md',
    label: 'Intelligence Context',
    sections: ['Core claim', 'Negative boundary', 'Positive definition', 'IAS mapping', 'Proof'],
  },
];

const DOCTRINE_CATALOG = [
  {
    acronym: 'IE',
    name: 'Inhabited Evolution',
    core_question: 'What concrete operational pressure earned this structure?',
    failure_mode: 'Invention by symmetry without earned pressure.',
    source_file: 'docs/concepts/doctrinal-review-template.md',
  },
  {
    acronym: 'CIPDA',
    name: 'Constructively Invariant Progressive De-Arbitrarization',
    core_question: 'What hidden arbitrariness was exposed or eliminated?',
    failure_mode: 'Toy substitute that should be folded into real substrate.',
    source_file: 'docs/concepts/doctrinal-review-template.md',
  },
  {
    acronym: 'IAS',
    name: 'Intelligence-Authority Separation',
    core_question: 'Who owns the durable state boundary here?',
    failure_mode: 'Agent owns something the Site should own.',
    source_file: 'docs/concepts/intelligence-context.md',
  },
  {
    acronym: 'PESA',
    name: 'Plural Embodiment, Singular Authority',
    core_question: 'How many agent embodiments could operate on this surface?',
    failure_mode: 'Design assumes a specific agent identity.',
    source_file: 'docs/concepts/doctrinal-review-template.md',
  },
  {
    acronym: 'CU',
    name: 'Constructive Universalization',
    core_question: 'What would this look like if every agent did it?',
    failure_mode: 'Hidden dependency on a single embodiment.',
    source_file: 'docs/concepts/doctrinal-review-template.md',
  },
  {
    acronym: 'CIS',
    name: 'Constructive Invariant System',
    core_question: 'What functional properties must future transformations preserve?',
    failure_mode: 'Closing a transformation path prematurely.',
    source_file: 'docs/concepts/doctrinal-review-template.md',
  },
  {
    acronym: 'ARI',
    name: 'Agent Role Invariant',
    core_question: 'Which agent role boundary is involved?',
    failure_mode: 'Cross-role authority leakage.',
    source_file: 'docs/concepts/doctrinal-review-template.md',
  },
];

const CCC_COORDINATES = [
  { code: 'C1', label: 'Architecture inflation', prompt: 'Did I complete structure by symmetry rather than pressure?' },
  { code: 'C2', label: 'Toy substitute', prompt: 'Did I build a lightweight workaround instead of using real substrate?' },
  { code: 'C3', label: 'Balance theater', prompt: 'Did I discuss all coordinates without applying real pressure?' },
  { code: 'C4', label: 'Diagnostic inflation', prompt: 'Did I turn every discomfort into six-dimensional analysis?' },
  { code: 'C5', label: 'Authority smearing', prompt: 'Did I conflate intelligence judgment with durable authority?' },
  { code: 'C6', label: 'Unearned abstraction', prompt: 'Did I add abstraction before pressure proved the need?' },
];

function readSourceFile(siteRoot, relPath) {
  const fullPath = resolve(siteRoot, relPath);
  if (!existsSync(fullPath)) {
    return { available: false, path: fullPath, content: null };
  }
  try {
    const content = readFileSync(fullPath, 'utf8');
    return { available: true, path: fullPath, content };
  } catch (err) {
    return { available: false, path: fullPath, error: err.message };
  }
}

function extractSection(content, sectionTitle) {
  if (!content) return null;
  const pattern = new RegExp(`##+\\s+${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n##+\\s|$)`, 'i');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

export function buildReground(siteRoot) {
  const sources = DOCTRINAL_SOURCES.map((src) => {
    const file = readSourceFile(siteRoot, src.path);
    const extracted = {};
    if (file.available) {
      for (const section of src.sections) {
        extracted[section] = extractSection(file.content, section);
      }
    }
    return {
      label: src.label,
      path: src.path,
      available: file.available,
      extracted,
    };
  });

  const allAvailable = sources.every((s) => s.available);
  const thoughtsCorpus = resolveThoughtsCorpus();

  return {
    schema: 'narada.doctrinal.reground.v0',
    generated_at: new Date().toISOString(),
    site_root: siteRoot,
    corpus_status: {
      thoughts_corpus: thoughtsCorpus,
      local_sources: {
        all_available: allAvailable,
        sources_checked: sources.map((s) => ({ label: s.label, path: s.path, available: s.available })),
      },
    },
    posture_summary: {
      default_posture: 'Act with disciplined agency. When a choice is reversible, localized, or can be recorded, make the conservative coherent choice and proceed.',
      slow_down_when: [
        'confuses User-locus and PC-locus authority',
        'mutates machine state without a PC-locus trace',
        'closes a meaningful future path',
        'overwrites user work',
        'hides uncertainty instead of recording it',
        'requires credentials, external publication, or destructive git operations',
      ],
    },
    doctrine_catalog: DOCTRINE_CATALOG,
    ccc_coordinates: CCC_COORDINATES,
    ias_mapping: {
      chain: 'O → F → C → W → V → D → N → X → Q → O',
      intelligence_context_hosts: 'C/W',
      intelligence_context_produces: 'V',
      intelligence_context_does_not_own: ['D', 'N', 'X', 'Q'],
      note: 'Intelligence Context hosts evaluation (C/W) and produces evaluation output (V). Decision (D), intent (N), execution (X), and confirmation (Q) remain external.',
    },
    review_protocol: {
      trigger: 'Structural drift sensed, before major architectural decisions, or when tasked.',
      time_budget: '10-20 minutes. If longer, you are doing diagnostic inflation.',
      guard_clauses: [
        'Do not fill every cell for the sake of completeness.',
        'Most coordinates should be blank or 0.',
        'Only mark what the operation has actually earned.',
      ],
      counterweight_priorities: {
        P0: 'Block release/merge until resolved',
        P1: 'Address in next task or chapter',
        P2: 'Record as residual; revisit when pressure earns it',
      },
    },
    source_excerpts: sources.reduce((acc, s) => {
      acc[s.path] = s.extracted;
      return acc;
    }, {}),
  };
}

function resolveThoughtsCorpus() {
  const candidates = [
    {
      label: 'windows',
      path: 'D:\\code\\thoughts\\content\\concepts',
      note: 'Windows thoughts corpus path.',
    },
    {
      label: 'wsl',
      path: '/home/andrey/src/thoughts/content/concepts/',
      note: 'WSL thoughts corpus path.',
    },
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate.path)) {
      return {
        path: candidate.path,
        available: true,
        source: candidate.label,
        checked_candidates: candidates.map((c) => ({ path: c.path, source: c.label, available: existsSync(c.path) })),
        note: candidate.note,
      };
    }
  }

  return {
    path: candidates[0].path,
    available: false,
    source: null,
    checked_candidates: candidates.map((c) => ({ path: c.path, source: c.label, available: false })),
    note: 'Thoughts corpus not accessible from checked Windows or WSL paths. Use the target embodiment or manual reading when full doctrinal depth is required.',
  };
}

export function formatMarkdown(result) {
  const lines = [];
  lines.push('# Doctrinal Reground');
  lines.push(`> Generated: ${result.generated_at}`);
  lines.push('');

  lines.push('## Corpus Status');
  lines.push(`- **Thoughts corpus** (WSL): ${result.corpus_status.thoughts_corpus.available ? 'Available' : 'Not accessible from Windows'}`);
  lines.push(`- **Local sources**: ${result.corpus_status.local_sources.all_available ? 'All present' : 'Some missing'}`);
  for (const src of result.corpus_status.local_sources.sources_checked) {
    lines.push(`  - ${src.label}: ${src.available ? '✓' : '✗'} \`${src.path}\``);
  }
  lines.push('');

  lines.push('## Default Posture');
  lines.push(result.posture_summary.default_posture);
  lines.push('');
  lines.push('**Slow down when:**');
  for (const item of result.posture_summary.slow_down_when) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  lines.push('## Doctrine Catalog');
  for (const d of result.doctrine_catalog) {
    lines.push(`### ${d.acronym} — ${d.name}`);
    lines.push(`- **Core question:** ${d.core_question}`);
    lines.push(`- **Failure mode:** ${d.failure_mode}`);
    lines.push(`- **Source:** \`${d.source_file}\``);
    lines.push('');
  }

  lines.push('## CCC Coordinates');
  for (const c of result.ccc_coordinates) {
    lines.push(`- **${c.code}** — ${c.label}: ${c.prompt}`);
  }
  lines.push('');

  lines.push('## IAS Mapping');
  lines.push(`\`${result.ias_mapping.chain}\``);
  lines.push(`- Intelligence Context hosts: \`${result.ias_mapping.intelligence_context_hosts}\``);
  lines.push(`- Intelligence Context produces: \`${result.ias_mapping.intelligence_context_produces}\``);
  lines.push(`- Does not own: ${result.ias_mapping.intelligence_context_does_not_own.join(', ')}`);
  lines.push('');

  lines.push('## Review Protocol');
  lines.push(`- **Trigger:** ${result.review_protocol.trigger}`);
  lines.push(`- **Time budget:** ${result.review_protocol.time_budget}`);
  lines.push('');
  lines.push('### Guard Clauses');
  for (const g of result.review_protocol.guard_clauses) {
    lines.push(`- ${g}`);
  }
  lines.push('');
  lines.push('### Counterweight Priorities');
  for (const [k, v] of Object.entries(result.review_protocol.counterweight_priorities)) {
    lines.push(`- **${k}:** ${v}`);
  }
  lines.push('');

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'json';
  const siteRoot = process.cwd();

  const result = buildReground(siteRoot);

  if (format === 'markdown') {
    console.log(formatMarkdown(result));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

// Guard: only run main when this module is executed directly, not when imported
if (import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  main();
}
