if (process.env.NARADA_RUNTIME_ENGINE !== 'rust') {
  process.stderr.write(`runtime_engine_not_rust:${process.env.NARADA_RUNTIME_ENGINE ?? 'missing'}\n`);
  process.exit(2);
}

process.stdout.write(`${JSON.stringify({
  schema: 'narada.runtime_engine_rust_target.v1',
  status: 'ready',
  runtime_engine_kind: process.env.NARADA_RUNTIME_ENGINE,
  argv: process.argv.slice(2),
})}\n`);
