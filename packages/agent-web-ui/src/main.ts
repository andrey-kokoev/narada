import { createApp } from 'vue';
import App from './app/App.vue';
import './agent-web-ui.css';
import { readInjectedConfig, resolveAttachConfig } from './config.js';

const config = resolveAttachConfig(window.location?.search ?? '', readInjectedConfig(document));

createApp(App, { config }).mount('#app');
