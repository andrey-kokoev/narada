export * from './workflows/cloudflare-carrier-live-smoke.mjs';

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const { main } = await import('./workflows/cloudflare-carrier-live-smoke.mjs');
  await main(process.argv.slice(2));
}
