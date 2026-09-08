export interface SampleCredentialDefinition {
  label?: string;
  loginId?: string;
  passwordHint: string;
}

export interface SampleRecordDefinition {
  title: string;
  titleReading?: string;
  url?: string;
  ogpImage?: string;
  ogpDescription?: string;
  memo?: string;
  tags: string[];
  ownerType: "user" | "family";
  credentials: SampleCredentialDefinition[];
}

export interface EncryptedCredentialInput {
  label?: string;
  loginId?: string;
  passwordHint: string;
  passwordHintIv: string;
  passwordHintDekEncrypted: string;
  passwordHintDekIv: string;
}

export interface EncryptedSampleRecordInput {
  title: string;
  titleReading?: string;
  url?: string;
  ogpImage?: string;
  ogpDescription?: string;
  memo?: string;
  tags: string[];
  ownerType: "user" | "family";
  credentials: EncryptedCredentialInput[];
}

export type OnboardingPhase =
  | "idle"
  | "modal"
  | "dashboard-tour-1"
  | "detail-tour"
  | "dashboard-tour-2"
  | "manual-tour"
  | "completed";
