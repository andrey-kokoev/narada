import { main } from '../../src/server-wrapper.mjs';

const relaySignal = (message) => {
  if (message?.signal === 'SIGINT' || message?.signal === 'SIGTERM') {
    process.off('message', relaySignal);
    process.disconnect?.();
    process.emit(message.signal);
  }
};
process.on('message', relaySignal);

await main();
