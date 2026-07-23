// The runtime-server test exercises the real NARS session-core binding. Keep
// the package-level live command pointed at that same acceptance scenario so
// the Pi kernel package cannot silently drift from its integration contract.
import '../../../agent-runtime-server/test/live-pi-sdk-kernel-e2e.mjs';
