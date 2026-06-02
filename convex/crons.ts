import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
// 15:00 UTC = 22:00 WIB, nightly per cafe.
crons.cron('nightly forecast', '0 15 * * *', internal.forecast.generateNightly, {});

export default crons;
