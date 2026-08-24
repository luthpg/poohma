import type { ReactElement } from "react";
import type { EmailPayload } from "./registry";
import { accountDeletedEmail } from "./templates/account/AccountDeletedEmail";
import { recordAdminChangedEmail } from "./templates/account/RecordAdminChangedEmail";
import { shareSettingChangedEmail } from "./templates/account/ShareSettingChangedEmail";
import { familyMigrationCompletedEmail } from "./templates/family/FamilyMigrationCompletedEmail";
import { familyWelcomeEmail } from "./templates/family/FamilyWelcomeEmail";
import { joinApprovedEmail } from "./templates/family/JoinApprovedEmail";
import { joinRequestReceivedEmail } from "./templates/family/JoinRequestReceivedEmail";
import { joinRequestRejectedEmail } from "./templates/family/JoinRequestRejectedEmail";
import { newMemberJoinedEmail } from "./templates/family/NewMemberJoinedEmail";
import { biometricRegisteredEmail } from "./templates/security/BiometricRegisteredEmail";
import { biometricRemovedEmail } from "./templates/security/BiometricRemovedEmail";
import { csvExportedEmail } from "./templates/security/CsvExportedEmail";
import { newDeviceLoginEmail } from "./templates/security/LoginNotificationEmail";

function resolve<Props>(
  definition: {
    subject: (props: Props) => string;
    Component: (props: Props) => ReactElement;
  },
  props: Props,
) {
  return {
    subject: definition.subject(props),
    element: definition.Component(props),
  };
}

export function resolveEmail(payload: EmailPayload) {
  switch (payload.template) {
    case "familyWelcome":
      return resolve(familyWelcomeEmail, payload.props);
    case "newMemberJoined":
      return resolve(newMemberJoinedEmail, payload.props);
    case "joinRequestReceived":
      return resolve(joinRequestReceivedEmail, payload.props);
    case "joinApproved":
      return resolve(joinApprovedEmail, payload.props);
    case "joinRequestRejected":
      return resolve(joinRequestRejectedEmail, payload.props);
    case "familyMigrationCompleted":
      return resolve(familyMigrationCompletedEmail, payload.props);
    case "shareSettingChanged":
      return resolve(shareSettingChangedEmail, payload.props);
    case "recordAdminChanged":
      return resolve(recordAdminChangedEmail, payload.props);
    case "accountDeleted":
      return resolve(accountDeletedEmail, payload.props);
    case "newDeviceLogin":
      return resolve(newDeviceLoginEmail, payload.props);
    case "csvExported":
      return resolve(csvExportedEmail, payload.props);
    case "biometricRegistered":
      return resolve(biometricRegisteredEmail, payload.props);
    case "biometricRemoved":
      return resolve(biometricRemovedEmail, payload.props);
  }
}
