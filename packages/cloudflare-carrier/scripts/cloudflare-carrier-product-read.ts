export * from './read-models/cloudflare-carrier-product-read.ts';

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const { main } = await import('./read-models/cloudflare-carrier-product-read.ts');
  await main(process.argv.slice(2));
}
