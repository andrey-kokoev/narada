#!/usr/bin/env node
process.env.NARADA_PROVIDER_LIVENESS_REFRESH_TRIGGER ||= 'windows_task_scheduler';
process.env.NARADA_PROVIDER_LIVENESS_SCHEDULER_TASK_NAME ||= '\\Narada\\CloudflareProviderLivenessRefresh';
process.env.NARADA_PROVIDER_LIVENESS_SCHEDULER_INTERVAL_MINUTES ||= '2';

await import('./cloudflare-carrier-provider-liveness-refresh.mjs');
