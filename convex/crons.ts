import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
// 15:00 UTC = 22:00 WIB, nightly per cafe.
crons.cron('nightly forecast', '0 15 * * *', internal.forecast.generateNightly, {});
// 01:00 UTC = 08:00 WIB, morning low-stock digest (opt-in per cafe).
crons.cron('daily low-stock alert', '0 1 * * *', internal.alerts.lowStockDigest, {});
crons.interval('reconcile qris', { minutes: 5 }, internal.payments.qrisDynamic.reconcilePending, {});

export default crons;
