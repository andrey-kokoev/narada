import { readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export async function loadCarrierTestSuite(kind) {
  if (!['unit', 'contract', 'live'].includes(kind)) {
    throw new Error(`cloudflare_carrier_test_suite_unknown:${kind}`);
  }

  const files = [];
  if (kind === 'unit') {
    for (const file of await listFiles(join(packageRoot, 'src'))) {
      const relativePath = relative(packageRoot, file).replaceAll('\\', '/');
      if (file.endsWith('.test.mjs') && !relativePath.startsWith('src/contracts/')) files.push(file);
    }
  }

  if (kind === 'contract') {
    for (const file of await listFiles(join(packageRoot, 'scripts'))) {
      const relativePath = relative(packageRoot, file).replaceAll('\\', '/');
      if (isCarrierContractTest(relativePath) && !isLiveTest(relativePath)) files.push(file);
    }
    for (const file of await listFiles(join(packageRoot, 'src', 'contracts'))) {
      if (file.endsWith('.test.mjs')) files.push(file);
    }
  }

  if (kind === 'live') {
    for (const file of await listFiles(join(packageRoot, 'scripts'))) {
      const relativePath = relative(packageRoot, file).replaceAll('\\', '/');
      if (isCarrierContractTest(relativePath) && isLiveTest(relativePath)) files.push(file);
    }
  }

  for (const file of files.sort()) {
    await import(pathToFileURL(file).href);
  }
  return files.map((file) => relative(packageRoot, file).replaceAll('\\', '/'));
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else files.push(path);
  }
  return files;
}

function isLiveTest(relativePath) {
  return /(?:^|-)live(?:-|\.test\.mjs)/u.test(relativePath)
    || /(?:coherence|convergence|posture).*live/u.test(relativePath);
}

function isCarrierContractTest(relativePath) {
  return relativePath.startsWith('scripts/contracts/')
    && relativePath.endsWith('.test.mjs')
    && !new Set([
      'scripts/contracts/unit-suite.test.mjs',
      'scripts/contracts/contract-suite.test.mjs',
      'scripts/contracts/live-suite.test.mjs',
    ]).has(relativePath);
}
