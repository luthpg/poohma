import { type Infer, v } from "convex/values";
import { accountDeletedEmail } from "./templates/account/AccountDeletedEmail";
import { recordAdminChangedEmail } from "./templates/account/RecordAdminChangedEmail";
import { shareSettingChangedEmail } from "./templates/account/ShareSettingChangedEmail";
import { familyMigrationCompletedEmail } from "./templates/family/FamilyMigrationCompletedEmail";
import { familyWelcomeEmail } from "./templates/family/FamilyWelcomeEmail";
import { joinApprovedEmail } from "./templates/family/JoinApprovedEmail";
import { joinRequestReceivedEmail } from "./templates/family/JoinRequestReceivedEmail";
import { joinRequestRejectedEmail } from "./templates/family/JoinRequestRejectedEmail";
import { newMemberJoinedEmail } from "./templates/family/NewMemberJoinedEmail";
import { passcodeRotatedEmail } from "./templates/family/PasscodeRotatedEmail";
import { biometricRegisteredEmail } from "./templates/security/BiometricRegisteredEmail";
import { biometricRemovedEmail } from "./templates/security/BiometricRemovedEmail";
import { csvExportedEmail } from "./templates/security/CsvExportedEmail";
import { newDeviceLoginEmail } from "./templates/security/LoginNotificationEmail";

export const emailTemplates = [
  familyWelcomeEmail,
  newMemberJoinedEmail,
  joinRequestReceivedEmail,
  joinApprovedEmail,
  joinRequestRejectedEmail,
  familyMigrationCompletedEmail,
  passcodeRotatedEmail,
  shareSettingChangedEmail,
  recordAdminChangedEmail,
  accountDeletedEmail,
  newDeviceLoginEmail,
  csvExportedEmail,
  biometricRegisteredEmail,
  biometricRemovedEmail,
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
  v.object({
    template: v.literal(passcodeRotatedEmail.key),
    props: passcodeRotatedEmail.props,
  }),
  v.object({
    template: v.literal(shareSettingChangedEmail.key),
    props: shareSettingChangedEmail.props,
  }),
  v.object({
    template: v.literal(recordAdminChangedEmail.key),
    props: recordAdminChangedEmail.props,
  }),
  v.object({
    template: v.literal(accountDeletedEmail.key),
    props: accountDeletedEmail.props,
  }),
  v.object({
    template: v.literal(newDeviceLoginEmail.key),
    props: newDeviceLoginEmail.props,
  }),
  v.object({
    template: v.literal(csvExportedEmail.key),
    props: csvExportedEmail.props,
  }),
  v.object({
    template: v.literal(biometricRegisteredEmail.key),
    props: biometricRegisteredEmail.props,
  }),
  v.object({
    template: v.literal(biometricRemovedEmail.key),
    props: biometricRemovedEmail.props,
  }),
);

export type EmailPayload = Infer<typeof emailPayload>;
