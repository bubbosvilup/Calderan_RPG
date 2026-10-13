/** Targeted 16-call production-default validation; all generated artifacts remain ignored. */
process.argv.push('--switch');
await import('./controller-bakeoff-round-2.mjs');
