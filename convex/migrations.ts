import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getFamilyAndRecords = internalQuery({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    const family = await ctx.db.get(args.familyId);
    if (!family) throw new Error("Family not found");

    const records = await ctx.db
      .query("serviceRecords")
      .withIndex("by_familyId", (q) => q.eq("familyId", family._id))
      .collect();

    return { family, records };
  },
});

export const updateRecordCredentials = internalMutation({
  args: {
    recordId: v.id("serviceRecords"),
    credentials: v.array(
      v.object({
        id: v.string(),
        passwordHint: v.string(),
        passwordHintIv: v.string(),
        passwordHintDekEncrypted: v.string(),
        passwordHintDekIv: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) return;

    const credUpdates = new Map(args.credentials.map((c) => [c.id, c]));
    const newCredentials = record.credentials.map((cred) => {
      const update = credUpdates.get(cred.id);
      if (update) {
        return {
          ...cred,
          ...update,
        };
      }
      return cred;
    });

    await ctx.db.patch(record._id, { credentials: newCredentials });
  },
});
