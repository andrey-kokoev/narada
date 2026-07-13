<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import type { OperatorConsoleNavItem } from '../console/routes';

defineProps<{
  eyebrow: string;
  title: string;
  backHref: string;
  backLabel: string;
  navItems: readonly OperatorConsoleNavItem[];
}>();
</script>

<template>
  <div class="operator-console-shell">
    <header class="console-bar">
      <div class="console-bar__identity">
        <a class="icon-link" :href="backHref" :title="backLabel" :aria-label="backLabel">
          <ArrowLeft :size="16" aria-hidden="true" />
        </a>
        <div>
          <p class="eyebrow">{{ eyebrow }}</p>
          <h1>{{ title }}</h1>
        </div>
      </div>
      <nav class="console-actions" aria-label="Operator Console navigation">
        <a
          v-for="item in navItems"
          :key="item.key"
          class="action-link"
          :href="item.href"
          :aria-current="item.current ? 'page' : undefined"
        >
          {{ item.label }}
        </a>
      </nav>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.operator-console-shell {
  min-width: 320px;
  min-height: 100vh;
  background: var(--background);
  color: var(--text);
}

.console-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.console-bar__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.console-bar h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  overflow-wrap: anywhere;
}

.eyebrow {
  margin: 0 0 3px;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.icon-link,
.action-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text);
  text-decoration: none;
}

.icon-link {
  width: 34px;
  height: 34px;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.icon-link:hover,
.action-link:hover {
  color: var(--operator);
}

.action-link {
  padding: 8px 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 13px;
}

.console-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .console-bar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .console-actions {
    width: 100%;
  }
}
</style>
