#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function executableCandidates(name) {
  if (/\.[^\\/]+$/.test(name)) return [name];
  if (process.platform === 'win32') {
    return [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name];
  }
  return [name];
}

function splitPathList(value) {
  return String(value || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .map((part) => part.trim())
    .filter(Boolean);
}

function findExecutable(name) {
  for (const dir of splitPathList(process.env.PATH)) {
    for (const candidate of executableCandidates(name)) {
      const path = join(dir, candidate);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

function findLibraryInEnv(name) {
  for (const dir of splitPathList(process.env.LIB)) {
    const path = join(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

function windowsSdkRoots() {
  if (process.platform !== 'win32') return [];
  return [
    process.env.WindowsSdkDir,
    'C:\\Program Files (x86)\\Windows Kits\\10\\Lib',
    'C:\\Program Files\\Windows Kits\\10\\Lib',
  ].filter(Boolean);
}

function findLibraryInWindowsSdk(name) {
  for (const root of windowsSdkRoots()) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const version of versions) {
      for (const arch of ['x64', 'x86', 'arm64']) {
        const path = join(root, version, 'um', arch, name);
        if (existsSync(path)) return path;
      }
    }
  }
  return null;
}

function main() {
  const cargo = findExecutable('cargo');
  const linker = findExecutable('link');
  const gdi32FromLib = findLibraryInEnv('gdi32.lib');
  const gdi32FromSdk = findLibraryInWindowsSdk('gdi32.lib');
  const gdi32 = gdi32FromLib || gdi32FromSdk;
  const ready = Boolean(cargo && linker && gdi32FromLib);
  const blockedReasons = [];
  if (!cargo) blockedReasons.push('missing_cargo');
  if (!linker) blockedReasons.push('missing_msvc_link_exe_on_path');
  if (!gdi32) blockedReasons.push('missing_windows_sdk_gdi32_lib');
  else if (!gdi32FromLib) blockedReasons.push('windows_sdk_lib_not_loaded_in_LIB');

  const result = {
    schema: 'narada.agent_tui.rust_toolchain_readiness.v0',
    status: ready ? 'ready' : 'blocked',
    cargo: cargo || 'not_found',
    msvc_linker: linker || 'not_found',
    windows_sdk_gdi32_lib: gdi32 || 'not_found',
    windows_sdk_gdi32_lib_visible_to_link: Boolean(gdi32FromLib),
    blocked_reasons: blockedReasons,
    next_check: ready ? null : 'where.exe link; echo $env:LIB',
    recovery: ready
      ? null
      : 'Install Visual Studio Build Tools C++ workload and Windows SDK, then run from Developer PowerShell or import the VS developer environment.',
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return ready ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}

export { findExecutable, findLibraryInEnv, findLibraryInWindowsSdk };
