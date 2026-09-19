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

import type { DriveStep } from "driver.js";

/**
 * 概念説明スライド内に配置される画像（スケルトン）のメタデータ
 */
export interface SlideImageSlot {
  /** 画像スロットの一意識別子 */
  id: string;
  /** 画像の目的・役割（アクセシビリティおよびスケルトン表示用） */
  role: string;
  /** バッジに表示するテキスト（省略時は「イメージ図」） */
  badgeText?: string;
  /** アスペクト比（省略時は "4/3"） */
  aspectRatio?: "16/9" | "4/3";
  /** 実画像ファイルのパス（省略時は id に対応する標準アセットを使用） */
  src?: string;
}

/**
 * 概念説明スライドと Spotlight を統合するオンボーディングステップ型
 */
export type OnboardingStep =
  | {
      type: "slide";
      title: string;
      description: string;
      imageSlot?: SlideImageSlot;
      nextBtnText?: string;
      prevBtnText?: string;
      doneBtnText?: string;
    }
  | {
      type: "spotlight";
      driveStep: DriveStep;
    };
