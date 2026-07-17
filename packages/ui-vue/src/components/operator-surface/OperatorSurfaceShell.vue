<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import type { OperatorSurfaceNavItem } from './types';

const props = defineProps<{
  eyebrow: string;
  title: string;
  backHref: string;
  backLabel: string;
  navItems: readonly OperatorSurfaceNavItem[];
  navigationGuard?: (href: string) => boolean;
}>();

function guardNavigation(event: MouseEvent, href: string): void {
  if (!props.navigationGuard
    || event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey) return;
  if (!props.navigationGuard(href)) event.preventDefault();
}
</script>

<template>
  <div class="operator-surface-shell">
    <header class="surface-bar">
      <div class="surface-bar__identity">
        <a class="icon-link" :href="backHref" :title="backLabel" :aria-label="backLabel" @click="guardNavigation($event, backHref)">
          <ArrowLeft :size="16" aria-hidden="true" />
        </a>
        <div>
          <p class="eyebrow">{{ eyebrow }}</p>
          <h1>{{ title }}</h1>
        </div>
      </div>
      <nav class="surface-actions" aria-label="Operator surface navigation">
        <a
          v-for="item in navItems"
          :key="item.key"
          class="action-link"
          :href="item.href"
          :aria-current="item.current ? 'page' : undefined"
          @click="guardNavigation($event, item.href)"
        >
          {{ item.label }}
        </a>
      </nav>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.operator-surface-shell {
  min-width: 320px;
  min-height: 100vh;
  background: var(--background);
  color: var(--text);
}

.surface-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.surface-bar__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.surface-bar h1 {
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

.surface-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .surface-bar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .surface-actions {
    width: 100%;
  }
}
</style>
