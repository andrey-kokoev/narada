export * from './commands/cloudflare-carrier-operation-status-put.mjs';

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const { main } = await import('./commands/cloudflare-carrier-operation-status-put.mjs');
  await main(process.argv.slice(2));
}
