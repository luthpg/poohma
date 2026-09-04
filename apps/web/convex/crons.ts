import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup expired family migrations",
  { hours: 1 },
  internal.families.cleanupExpiredMigrationsInternal,
);

crons.interval(
  "cleanup expired export vaults",
  { hours: 1 },
  internal.families.cleanupExpiredExportVaultsInternal,
);

crons.interval(
  "cleanup old login events",
  { hours: 24 },
  internal.users.cleanupOldLoginEventsInternal,
);

crons.interval(
  "cleanup expired family invites",
  { hours: 24 },
  internal.families.cleanupExpiredFamilyInvitesInternal,
);

export default crons;
