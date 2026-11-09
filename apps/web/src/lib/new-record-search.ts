import { z } from "zod";

export const newRecordSearchSchema = z.object({
  draftId: z.coerce.string().optional(),
  url: z.coerce.string().optional(),
  title: z.coerce.string().optional(),
  loginId: z.coerce.string().optional(),
  accountId: z.coerce.string().optional(),
});
