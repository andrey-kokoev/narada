<script setup lang="ts">
import { ref } from 'vue';
import { History, RefreshCw } from 'lucide-vue-next';
import OperatorConsoleShell from '../components/OperatorConsoleShell.vue';
import { useOperatorConsoleLauncherSessions } from '../launcher/composables/useOperatorConsoleLauncherSessions';

const {
  sessions,
  history,
  loading,
  error,
  load: loadSessions,
} = useOperatorConsoleLauncherSessions();

const showHistory = ref(false);
</script>

<template>
  <OperatorConsoleShell
    eyebrow="Operator Console"
    title="Agent Launcher"
    back-href="/"
    back-label="Back to Operator Workspace"
    navigation-key="launcher"
  >
    <main class="launcher-router-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Launch routing</p>
          <h2>Agent Launcher</h2>
          <p class="subtitle">Open a CLI-owned launcher session without moving launch authority into the console.</p>
        </div>
        <div class="page-actions">
          <button
            v-if="history.length > 0"
            class="history-button"
            type="button"
            :aria-expanded="showHistory"
            @click="showHistory = !showHistory"
          >
            <History :size="15" aria-hidden="true" />
            {{ showHistory ? 'Hide history' : 'History' }}
            <span class="action-count">{{ history.length }}</span>
          </button>
          <button class="refresh-button" type="button" :disabled="loading" @click="loadSessions">
            <RefreshCw :size="15" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <p v-if="loading" class="state-message" role="status">Looking for active launcher sessions...</p>
      <p v-else-if="error" class="state-message state-message-error" role="alert">{{ error }}</p>
      <div v-else>
        <section v-if="sessions.length > 0" class="session-list" aria-labelledby="sessions-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">CLI-owned sessions</p>
              <h3 id="sessions-title">Available launcher sessions</h3>
            </div>
            <span class="result-count">{{ sessions.length }}</span>
          </div>
          <article v-for="session in sessions" :key="session.ui_session_id" class="session-row">
            <div>
              <strong>{{ session.ui_session_id }}</strong>
              <p>{{ session.status }} · started {{ session.started_at }}</p>
            </div>
            <a
              v-if="session.url"
              class="open-link"
              :href="session.url"
              target="_blank"
              rel="noreferrer"
            >
              Open launcher
            </a>
            <span v-else class="unavailable-label">No URL recorded</span>
          </article>
        </section>

        <section v-else class="handoff-panel" aria-labelledby="start-launcher-title">
          <p class="eyebrow">No active session</p>
          <h3 id="start-launcher-title">Start the launcher from the CLI</h3>
          <p>After the session starts, return here and refresh to open its browser surface.</p>
          <code>narada launcher workspace-launch --interactive-selection-ui --persistent</code>
        </section>

        <section v-if="showHistory && history.length > 0" class="history-list" aria-labelledby="history-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Read-only record</p>
              <h3 id="history-title">Previous launcher sessions</h3>
            </div>
            <span class="result-count">{{ history.length }}</span>
          </div>
          <article v-for="session in history" :key="session.ui_session_id" class="session-row history-row">
            <div>
              <strong>{{ session.ui_session_id }}</strong>
              <p>{{ session.status }} · started {{ session.started_at }}</p>
            </div>
            <span class="unavailable-label">Historical record</span>
          </article>
        </section>
      </div>
    </main>
  </OperatorConsoleShell>
</template>

<style scoped>
.launcher-router-page {
  min-height: calc(100vh - 64px);
  padding: 28px clamp(14px, 4vw, 44px) 48px;
  background: var(--background);
  color: var(--text);
}

.history-button {
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}

.history-button:hover,
.history-button[aria-expanded="true"] {
  border-color: var(--line);
  background: var(--surface-muted);
  color: var(--text);
}

.action-count {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--surface-muted);
  font-size: 11px;
  text-align: center;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-header,
.session-list,
.handoff-panel {
  max-width: 960px;
  margin-inline: auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}

.page-header h2,
.session-list h3,
.handoff-panel h3 {
  margin: 0;
  font-size: 22px;
}

.session-list h3,
.handoff-panel h3 {
  font-size: 17px;
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.subtitle,
.handoff-panel p,
.session-row p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.subtitle {
  max-width: 680px;
  margin: 8px 0 0;
}

.refresh-button,
.history-button,
.open-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--control-bg);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
}

.refresh-button:hover,
.open-link:hover {
  background: var(--surface-muted);
}

.refresh-button:disabled {
  cursor: wait;
  opacity: .55;
}

.state-message,
.handoff-panel {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.state-message {
  max-width: 960px;
  margin: 0 auto;
  color: var(--muted);
}

.state-message-error {
  color: var(--danger);
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.result-count {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12px;
}

.session-list {
  display: grid;
  gap: 10px;
}

.history-list {
  display: grid;
  gap: 10px;
  margin-top: 28px;
}

.history-row {
  background: var(--surface-muted);
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.session-row strong {
  font: 13px/1.4 var(--mono);
}

.session-row p {
  margin: 5px 0 0;
}

.unavailable-label {
  color: var(--muted);
  font-size: 12px;
}

.handoff-panel p {
  margin: 8px 0 14px;
}

.handoff-panel code {
  display: block;
  overflow-x: auto;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text);
  font: 12px/1.5 var(--mono);
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .page-header,
  .session-row {
    align-items: stretch;
    flex-direction: column;
  }

  .refresh-button,
  .history-button,
  .open-link {
    width: 100%;
  }

  .page-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
