#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { projectIntent } from '../lifecycle/project-onboarding-intent.mjs';
import { siteControlRoot } from '../site-layout.mjs';

const SCHEMA = 'narada.site_init.result.v0';

const SEED_FILES = [
  '.narada/site.json',
  '.narada/README.md',
  '.narada/bootstrap/startup.md',
  '.narada/bootstrap/initial-memory.md',
  '.narada/bootstrap/initial-memory.json',
  '.narada/admission/admission-ledger.jsonl',
  '.narada/admission/pending-handoffs.json',
  '.narada/capabilities/mcp-surfaces.json',
  '.narada/capabilities/missing-capabilities.md',
  '.narada/inbox/README.md',
  '.narada/checkpoints/README.md'
];

const NON_PORTABLE_REFUSALS = [
  '.ai',
  'SQLite databases',
  'inbox/task/checkpoint history',
  'rosters',
  'operator-surface runtime state',
  'PC-locus display/window evidence',
  'secrets'
];

function seedFileContent(relativePath, result) {
  const now = new Date().toISOString();
  const payloads = {
    '.narada/site.json': `${JSON.stringify({
      schema: 'narada.site.v0',
      site_id: result.project_id,
      project_root: result.project_root,
      project_memory_root: result.project_memory_root,
      created_at: now,
      status: 'seeded_pending_admission'
    }, null, 2)}\n`,
    '.narada/README.md': `# Narada Project Memory\n\nProject: ${result.project_id}\n\nThis directory is the local Narada project memory seed. It was created by guarded site init and contains no imported runtime history.\n`,
    '.narada/bootstrap/startup.md': `# Startup\n\nVerify identity and locus before mutation.\n\nProject root: ${result.project_root}\nProject memory root: ${result.project_memory_root}\n`,
    '.narada/bootstrap/initial-memory.md': '# Initial Memory\n\nNo prior memory imported. First memory should be created locally under receiving-Site authority.\n',
    '.narada/bootstrap/initial-memory.json': `${JSON.stringify({
      schema: 'narada.initial_memory.v0',
      status: 'none',
      source: null,
      note: 'No prior memory imported.'
    }, null, 2)}\n`,
    '.narada/admission/admission-ledger.jsonl': `${JSON.stringify({
      schema: 'narada.admission.event.v0',
      event: 'site_seed_created',
      status: 'seeded_pending_admission',
      created_at: now
    })}\n`,
    '.narada/admission/pending-handoffs.json': `${JSON.stringify({
      schema: 'narada.pending_handoffs.v0',
      handoffs: []
    }, null, 2)}\n`,
    '.narada/capabilities/mcp-surfaces.json': `${JSON.stringify({
      schema: 'narada.mcp_surfaces.v0',
      surfaces: [],
      status: 'missing_capabilities_declared_elsewhere'
    }, null, 2)}\n`,
    '.narada/capabilities/missing-capabilities.md': '# Missing Capabilities\n\nNo MCP capabilities are granted by site init. Add capabilities through a separate admitted setup path.\n',
    '.narada/inbox/README.md': '# Inbox\n\nNo inbox history exists yet.\n',
    '.narada/checkpoints/README.md': '# Checkpoints\n\nNo checkpoint history exists yet.\n'
  };
  return payloads[relativePath] ?? '';
}

function normalizePath(value) {
  return path.resolve(value || process.cwd());
}

function sanitizeProjectId(name) {
  const sanitized = String(name || 'project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'project';
}

function isSuspiciousRoot(projectRoot) {
  const resolved = normalizePath(projectRoot);
  const parsed = path.parse(resolved);
  const lower = resolved.toLowerCase();
  const home = normalizePath(os.homedir()).toLowerCase();
  const temp = normalizePath(os.tmpdir()).toLowerCase();

  if (resolved === parsed.root) {
    return { suspicious: true, reason: 'project_root_is_filesystem_root' };
  }

  if (lower === home) {
    return { suspicious: true, reason: 'project_root_is_user_home' };
  }

  if (lower === temp) {
    return { suspicious: true, reason: 'project_root_is_temp_root' };
  }

  const systemSegments = ['windows', 'program files', 'program files (x86)', 'programdata'];
  const basename = path.basename(resolved).toLowerCase();
  if (systemSegments.includes(basename)) {
    return { suspicious: true, reason: 'project_root_is_system_directory' };
  }

  return { suspicious: false, reason: null };
}

function projectionTargetsProjectMemory(siteConfigProposal) {
  if (!siteConfigProposal) return true;
  const kinds = new Set(siteConfigProposal.required_sites.map((site) => site.kind));
  return kinds.has('project_site')
    || kinds.has('client_receiving_site')
    || kinds.has('handoff_adoption_site');
}

function baseResult({ command, projectRoot, siteConfigProposal = null }) {
  const resolvedRoot = normalizePath(projectRoot);
  const projectMemoryRoot = siteControlRoot(resolvedRoot);
  return {
    schema: SCHEMA,
    command,
    status: 'blocked',
    project_id: sanitizeProjectId(path.basename(resolvedRoot)),
    project_root: resolvedRoot,
    project_memory_root: projectMemoryRoot,
    authority_basis: null,
    authority_classification: 'blocked',
    created_files: [],
    would_create_files: [],
    non_portable_refusals: NON_PORTABLE_REFUSALS,
    site_config_proposal: siteConfigProposal,
    handoff_status: 'none',
    missing_capabilities: [],
    next_command: null,
    agent_next_action: 'stop',
    pause_triggers: [],
    messages: []
  };
}

function statMaybe(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function createSeed(result) {
  const createdFiles = [];
  for (const relativePath of SEED_FILES) {
    const targetPath = path.join(result.project_root, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, seedFileContent(relativePath, result), { flag: 'wx' });
    createdFiles.push(relativePath);
  }
  return createdFiles;
}

function inspectProject({
  command = 'init',
  projectRoot = process.cwd(),
  apply = false,
  yes = false,
  intent = null
} = {}) {
  const siteConfigProposal = intent ? projectIntent(intent) : null;
  const result = baseResult({ command, projectRoot, siteConfigProposal });
  const rootStat = statMaybe(result.project_root);

  if (!projectionTargetsProjectMemory(siteConfigProposal)) {
    return {
      ...result,
      status: 'blocked',
      authority_classification: 'blocked',
      next_command: 'narada doctor',
      agent_next_action: 'stop',
      pause_triggers: ['intent_does_not_target_project_site_init'],
      messages: ['Intent projection does not target project or receiving Site init. No files changed.']
    };
  }

  if (!rootStat || !rootStat.isDirectory()) {
    return {
      ...result,
      status: 'blocked',
      authority_classification: 'blocked',
      pause_triggers: ['project_root_missing_or_not_directory'],
      messages: ['Project root does not exist or is not a directory.']
    };
  }

  const suspicious = isSuspiciousRoot(result.project_root);
  if (suspicious.suspicious) {
    return {
      ...result,
      status: 'blocked',
      authority_classification: 'blocked',
      next_command: 'narada init --root <project-root>',
      pause_triggers: [suspicious.reason],
      messages: ['Project root is suspicious; select an explicit project root before init.']
    };
  }

  if (apply && !yes) {
    return {
      ...result,
      status: 'refused',
      authority_classification: 'refused',
      next_command: 'narada init',
      agent_next_action: 'stop',
      pause_triggers: ['write_mode_not_implemented'],
      messages: ['Apply mode requires --yes confirmation. No files changed.']
    };
  }

  const siteStat = statMaybe(result.project_memory_root);
  const hasNarada = Boolean(siteStat && siteStat.isDirectory());
  const incompatibleNarada = Boolean(siteStat && !siteStat.isDirectory());

  if (incompatibleNarada) {
    return {
      ...result,
      status: 'blocked',
      authority_classification: 'blocked',
      next_command: 'narada doctor',
      agent_next_action: 'stop',
      pause_triggers: ['project_memory_root_exists_but_is_not_directory'],
      messages: ['A .narada path exists but is not a directory. No files changed.']
    };
  }

  if (command === 'start') {
    if (hasNarada) {
      return {
        ...result,
        status: 'already_initialized',
        authority_classification: 'preview_only',
        next_command: 'narada start',
        agent_next_action: 'start_first_session',
        messages: ['Narada project memory is present.']
      };
    }

    return {
      ...result,
      status: 'not_initialized',
      authority_classification: 'preview_only',
      next_command: 'narada init',
      agent_next_action: 'preview',
      messages: ['No Narada project memory found in this folder.']
    };
  }

  if (command === 'doctor') {
    return {
      ...result,
      status: 'doctor_report',
      authority_classification: 'preview_only',
      setup_status: hasNarada ? 'present' : 'not_initialized',
      next_command: hasNarada ? 'narada start' : 'narada init',
      agent_next_action: hasNarada ? 'start_first_session' : 'preview',
      messages: [hasNarada ? 'Narada project memory is present.' : 'No Narada project memory found.']
    };
  }

  if (hasNarada) {
    return {
      ...result,
      status: 'already_initialized',
      authority_classification: 'preview_only',
      next_command: 'narada start',
      agent_next_action: 'start_first_session',
      messages: ['Narada is already initialized in this folder.']
    };
  }

  if (yes) {
    const createdFiles = createSeed(result);
    return {
      ...result,
      status: 'initialized',
      authority_basis: 'operator_confirmed_init_yes',
      authority_classification: 'write_authorized',
      created_files: createdFiles,
      next_command: 'narada start',
      agent_next_action: 'start_first_session',
      messages: ['Created Narada project memory. No prior memory imported.']
    };
  }

  return {
    ...result,
    status: 'previewed',
    authority_classification: 'preview_only',
    would_create_files: SEED_FILES,
    next_command: 'narada init --yes',
    agent_next_action: 'ask_operator',
    messages: ['Narada init preview. No files changed.']
  };
}

function parseArgs(argv) {
  const args = [...argv];
  let command = 'init';
  let projectRoot = process.cwd();
  let apply = false;
  let yes = false;
  let pretty = false;
  let intentPath = null;
  let intent = null;

  if (args[0] && !args[0].startsWith('-')) {
    command = args.shift();
  }

  if (!['start', 'init', 'doctor'].includes(command)) {
    throw new Error(`Unsupported command: ${command}`);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root') {
      const next = args[index + 1];
      if (!next) throw new Error('--root requires a path');
      projectRoot = next;
      index += 1;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--yes') {
      yes = true;
    } else if (arg === '--preview') {
      apply = false;
    } else if (arg === '--pretty') {
      pretty = true;
    } else if (arg === '--intent') {
      const next = args[index + 1];
      if (!next) throw new Error('--intent requires a path');
      intentPath = next;
      index += 1;
    } else if (arg === '--intent-json') {
      const next = args[index + 1];
      if (!next) throw new Error('--intent-json requires JSON');
      intent = JSON.parse(next);
      index += 1;
    } else if (arg === '--json') {
      // JSON is the only output format in this first slice.
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (intentPath) {
    intent = JSON.parse(fs.readFileSync(intentPath, 'utf8'));
  }

  return { command, projectRoot, apply, yes, pretty, intent };
}

function runCli(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
  try {
    const options = parseArgs(argv);
    const result = inspectProject(options);
    stdout.write(`${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`);
    return result.status === 'blocked' || result.status === 'refused' ? 2 : 0;
  } catch (error) {
    const result = {
      schema: SCHEMA,
      status: 'refused',
      authority_classification: 'refused',
      agent_next_action: 'stop',
      messages: [error.message]
    };
    stderr.write(`${JSON.stringify(result)}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}

export { SCHEMA, SEED_FILES, inspectProject, parseArgs, runCli };
