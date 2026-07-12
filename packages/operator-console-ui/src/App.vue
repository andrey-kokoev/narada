<script setup lang="ts">
import SiteRegistryPage from './pages/SiteRegistryPage.vue';
import SiteRegistryMutationPage from './pages/SiteRegistryMutationPage.vue';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const mode = pathname.endsWith('/add') ? 'add' : pathname.endsWith('/manage') ? 'manage' : null;
</script>

<template>
  <SiteRegistryMutationPage v-if="mode" :mode="mode" />
  <SiteRegistryPage v-else />
</template>
