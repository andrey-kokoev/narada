const mode = process.argv[2] ?? 'success';
process.stdin.resume();
process.stdin.on('end', () => {
  if (mode === 'exit') {
    process.stderr.write('fixture codex failure\n');
    process.exit(9);
  }
  if (mode === 'malformed') {
    process.stdout.write('{not-json}\n');
    return;
  }
  if (mode === 'hang') {
    setInterval(() => {}, 1000);
    return;
  }
  process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 'fixture-thread' })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { id: 'message-1', type: 'agent_message', text: 'fixture codex response' } })}\n`);
});
