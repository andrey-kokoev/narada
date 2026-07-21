export * from './commands/cloudflare-carrier-operation-create.mjs';

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const { main } = await import('./commands/cloudflare-carrier-operation-create.mjs');
  await main(process.argv.slice(2));
}
