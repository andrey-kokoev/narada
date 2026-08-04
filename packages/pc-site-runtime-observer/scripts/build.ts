import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tscArgs = ['exec', 'tsc', '-p', resolve(root, 'tsconfig.build.json')];
const tsc = spawnSync(
  process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'pnpm',
  process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm', ...tscArgs] : tscArgs,
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
if (tsc.error) throw tsc.error;
if ((tsc.status ?? 1) !== 0) process.exit(tsc.status ?? 1);
if (process.platform === 'win32') {
  const rust = spawnSync('cargo', ['build', '--release', '--manifest-path', resolve(root, 'native', 'Cargo.toml')], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (rust.error) throw rust.error;
  process.exitCode = rust.status ?? 1;
}
