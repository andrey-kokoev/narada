<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { MailboxSummary } from '../composables/useMailboxSummary';

const props = defineProps<{
  available: boolean;
  summary: MailboxSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const expandedMessages = ref(new Set<string>());

const accounts = computed(() => props.summary.accounts.items);
const messages = computed(() => props.summary.messages.items);
const mailboxLabel = computed(() => `Synced Email: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${props.summary.messages.count} messages`);
const subtitle = computed(() => props.summary.serverName ? `${props.summary.serverName} · synced mailbox projection` : 'synced mailbox projection');

watch(open, (value) => {
  if (value) emit('refresh');
});

function isExpanded(key: string): boolean {
  return expandedMessages.value.has(key);
}

function toggleMessage(key: string) {
  const next = new Set(expandedMessages.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedMessages.value = next;
}

function messageKey(message: Record<string, unknown>): string {
  return textField(message, 'message_id') || `${textField(message, 'mailbox_id')}:${textField(message, 'subject')}:${textField(message, 'received_at')}`;
}

function accountLine(account: Record<string, unknown>): string {
  return [
    textField(account, 'mailbox_id', 'address'),
    numberField(account, 'message_count') !== null ? `${numberField(account, 'message_count')} messages` : null,
    numberField(account, 'unread_count') !== null ? `${numberField(account, 'unread_count')} unread` : null,
  ].filter(Boolean).join(' · ');
}

function messageMeta(message: Record<string, unknown>): string {
  return [
    textField(message, 'from') ? `from ${textField(message, 'from')}` : null,
    textField(message, 'mailbox_id'),
    textField(message, 'folder'),
    textField(message, 'received_at') || textField(message, 'sent_at'),
    textField(message, 'unread') === 'true' ? 'unread' : null,
    textField(message, 'attachment_count') && textField(message, 'attachment_count') !== '0' ? `${textField(message, 'attachment_count')} attachments` : null,
  ].filter(Boolean).join(' · ');
}

function textField(record: Record<string, unknown>, ...fields: string[]): string {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }
  return '';
}

function numberField(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArrayField(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry)) : [];
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.summary, null, 2));
    copyLabel.value = 'Copied';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1400);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1800);
  }
}
</script>

<template>
  <div v-if="available && !triggerless" class="mailbox-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger mailbox-panel-trigger" :aria-expanded="open" aria-controls="mailbox-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ mailboxLabel }}</span>
    </button>
  </div>
  <Teleport v-if="available" to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Synced Email panel" @click="open = false"></button>
          <aside id="mailbox-panel" class="mcp-panel mailbox-panel" aria-label="Synced Email projection">
            <header class="mcp-panel-header">
              <div>
                <h2>Synced Email</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Synced Email panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div>
                <dt>State</dt>
                <dd>{{ summary.status }}</dd>
              </div>
              <div>
                <dt>Accounts</dt>
                <dd>{{ summary.accounts.count }}</dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{{ summary.messages.count }}</dd>
              </div>
              <div>
                <dt>Unread</dt>
                <dd>{{ summary.unread.count }}</dd>
              </div>
            </dl>
            <div class="mcp-panel-actions">
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <div class="sop-items-scroll mailbox-items-scroll">
              <section class="sop-section mailbox-section" aria-label="Synced mailbox accounts">
                <h3>Accounts</h3>
                <ol v-if="accounts.length" class="mcp-server-list mailbox-item-list narada-list-reset">
                  <li v-for="account in accounts" :key="textField(account, 'mailbox_id') || textField(account, 'label')" class="mcp-server-item mailbox-item">
                    <div class="mcp-server-row mailbox-item-row">
                      <span class="mcp-server-main">
                        <strong>{{ textField(account, 'label') || textField(account, 'mailbox_id') }}</strong>
                        <span>{{ accountLine(account) }}</span>
                        <span v-if="textField(account, 'latest_received_at')">Latest {{ textField(account, 'latest_received_at') }}</span>
                      </span>
                    </div>
                  </li>
                </ol>
                <p v-else class="mcp-panel-empty">No synced mailbox accounts are currently reported.</p>
              </section>
              <section class="sop-section mailbox-section" aria-label="Recent synced email messages">
                <h3>Recent messages</h3>
                <ol v-if="messages.length" class="mcp-server-list mailbox-item-list narada-list-reset">
                  <li v-for="message in messages" :key="messageKey(message)" class="mcp-server-item mailbox-item">
                    <button type="button" class="mcp-server-row mailbox-item-row" :aria-expanded="isExpanded(messageKey(message))" @click="toggleMessage(messageKey(message))">
                      <span class="mcp-server-main">
                        <strong>{{ textField(message, 'subject') }}</strong>
                        <span>{{ messageMeta(message) }}</span>
                        <span v-if="textField(message, 'preview')">{{ textField(message, 'preview') }}</span>
                      </span>
                      <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(messageKey(message)) ? '−' : '+' }}</span>
                    </button>
                    <div v-if="isExpanded(messageKey(message))" class="mcp-tool-list mailbox-message-detail">
                      <span v-if="textField(message, 'thread_id')">Thread {{ textField(message, 'thread_id') }}</span>
                      <span v-if="textField(message, 'importance')">Importance {{ textField(message, 'importance') }}</span>
                      <span v-if="stringArrayField(message, 'categories').length">Categories {{ stringArrayField(message, 'categories').join(', ') }}</span>
                      <span v-if="textField(message, 'message_id')">Message {{ textField(message, 'message_id') }}</span>
                    </div>
                  </li>
                </ol>
                <p v-else class="mcp-panel-empty">No synced messages are currently reported by the mailbox MCP.</p>
              </section>
              <p v-if="summary.errors.length" class="mcp-panel-empty">{{ summary.errors.map((error) => error.message ?? error.code ?? 'Mailbox read error').join('; ') }}</p>
            </div>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
