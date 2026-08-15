import { type Infer, v } from "convex/values";
import { familyMigrationCompletedEmail } from "./templates/family/FamilyMigrationCompletedEmail";
import { familyWelcomeEmail } from "./templates/family/FamilyWelcomeEmail";
import { joinApprovedEmail } from "./templates/family/JoinApprovedEmail";
import { joinRequestReceivedEmail } from "./templates/family/JoinRequestReceivedEmail";
import { joinRequestRejectedEmail } from "./templates/family/JoinRequestRejectedEmail";
import { newMemberJoinedEmail } from "./templates/family/NewMemberJoinedEmail";

export const emailTemplates = [
  familyWelcomeEmail,
  newMemberJoinedEmail,
  joinRequestReceivedEmail,
  joinApprovedEmail,
  joinRequestRejectedEmail,
  familyMigrationCompletedEmail,
] as const;

export const emailPayload = v.union(
  v.object({
    template: v.literal(familyWelcomeEmail.key),
    props: familyWelcomeEmail.props,
  }),
  v.object({
    template: v.literal(newMemberJoinedEmail.key),
    props: newMemberJoinedEmail.props,
  }),
  v.object({
    template: v.literal(joinRequestReceivedEmail.key),
    props: joinRequestReceivedEmail.props,
  }),
  v.object({
    template: v.literal(joinApprovedEmail.key),
    props: joinApprovedEmail.props,
  }),
  v.object({
    template: v.literal(joinRequestRejectedEmail.key),
    props: joinRequestRejectedEmail.props,
  }),
  v.object({
    template: v.literal(familyMigrationCompletedEmail.key),
    props: familyMigrationCompletedEmail.props,
  }),
);

export type EmailPayload = Infer<typeof emailPayload>;
