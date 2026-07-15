import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(packageRoot, 'public');
const operatorConsoleDist = resolve(packageRoot, '..', 'operator-console-ui', 'dist');
const agentWebUiDist = resolve(packageRoot, '..', 'agent-web-ui', 'dist');

await rm(publicRoot, { recursive: true, force: true });
await mkdir(resolve(publicRoot, 'console', 'registry'), { recursive: true });
await mkdir(resolve(publicRoot, 'sessions'), { recursive: true });
await cp(operatorConsoleDist, resolve(publicRoot, 'console', 'registry'), { recursive: true });
await cp(agentWebUiDist, resolve(publicRoot, 'sessions'), { recursive: true });

console.log(`Cloudflare workspace assets assembled at ${publicRoot}`);
