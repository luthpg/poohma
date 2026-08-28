import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup expired family migrations",
  { hours: 1 },
  internal.families.cleanupExpiredMigrationsInternal,
);

crons.interval(
  "cleanup old login events",
  { hours: 24 },
  internal.users.cleanupOldLoginEventsInternal,
);

export default crons;
