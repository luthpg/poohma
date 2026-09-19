import type { DriveStep } from "driver.js";
import { renderSlideHtml } from "./renderSlide";
import type { OnboardingStep } from "./types";

/**
 * OnboardingStep[] を Driver.js が解釈できる DriveStep[] に変換する純粋関数
 */
export function toDriveSteps(steps: OnboardingStep[]): DriveStep[] {
  return steps.map((step) => {
    if (step.type === "spotlight") {
      return step.driveStep;
    }

    return {
      element: undefined,
      popover: {
        title: step.title,
        description: renderSlideHtml(step),
        popoverClass: "poohma-tour-popover poohma-tour-slide",
        nextBtnText: step.nextBtnText ?? "次へ",
        prevBtnText: step.prevBtnText ?? "戻る",
        doneBtnText: step.doneBtnText,
      },
    };
  });
}

/**
 * ダッシュボード（前半）：アプリの概要とサンプルの紹介
 */
export const dashboardPart1StepDefinitions: OnboardingStep[] = [
  {
    type: "slide",
    title: "家族のサービス情報を、ひとまとめに安心管理！",
    description:
      "動画配信やネット回線、公共料金など、家族で使うサービスのアカウントをまとめて整理できます。「家族共有」と「自分専用」を分けて安全に管理できるアプリです。",
    imageSlot: {
      id: "welcome-family-share",
      role: "動画・ネット・暮らしなど家族のサービス情報がまとまる全体像",
      badgeText: "アプリの概要",
      aspectRatio: "4/3",
    },
    nextBtnText: "次へ",
    prevBtnText: "戻る",
  },
  {
    type: "spotlight",
    driveStep: {
      element: '[data-tour="sample-record"]',
      popover: {
        title: "サンプルのサービスを見てみましょう",
        description:
          "ここに家族のアカウントが並びます。<br />「共有中」なら家族みんなで、「自分のみ」なら自分専用。<br />さっそくタップして中を見てみましょう！",
        side: "bottom",
        align: "start",
        doneBtnText: "詳細画面へ",
      },
    },
  },
];

export const dashboardPart1Steps: DriveStep[] = toDriveSteps(
  dashboardPart1StepDefinitions,
);

/**
 * レコード詳細画面（導入編）：安心のヒミツとカギの開閉体験
 */
export const recordDetailIntroStepDefinitions: OnboardingStep[] = [
  {
    type: "slide",
    title: "安心のヒミツ：家族だけの「合言葉」でカギが開く",
    description:
      "大切なパスワードヒントは、自動でカギがかけられています。PoohMaの運営であっても、あなたとご家族以外には読めない安心の仕組みです。",
    imageSlot: {
      id: "e2ee-secret-lock",
      role: "秘密の合言葉を使ってスマホの中でカギを開け閉めする仕組み",
      badgeText: "安心の仕組み",
      aspectRatio: "4/3",
    },
    nextBtnText: "次へ",
    prevBtnText: "戻る",
  },
  {
    type: "spotlight",
    driveStep: {
      element: '[data-tour="hint-reveal-btn"]',
      popover: {
        title: "試しにカギを開けてみましょう！",
        description:
          "「🔒 クリックして表示」を押してみてください。<br />あなたのスマホの中だけでサッとカギが開き、ヒントが現れます！",
        side: "bottom",
        align: "start",
        showButtons: ["previous", "close"],
      },
    },
  },
];

/**
 * レコード詳細画面（帰還編）：ヒント確認後のダッシュボード案内
 */
export const recordDetailReturnStepDefinitions: OnboardingStep[] = [
  {
    type: "spotlight",
    driveStep: {
      element: '[data-tour="decrypted-hint"]',
      popover: {
        title: "カギが開いてヒントが現れました！",
        description:
          "先ほど入力していただいた「合言葉」によって、安全に暗号が解かれました。<br />あなたとご家族以外には、PoohMaの運営であっても読めない安心の仕組みです。",
        side: "bottom",
        align: "start",
        nextBtnText: "次へ進む",
      },
    },
  },
  {
    type: "spotlight",
    driveStep: {
      element: '[data-tour="back-to-dashboard"]',
      popover: {
        title: "ダッシュボードに戻りましょう",
        description:
          "カギの開け閉めが体験できましたね！<br />左上のボタンからダッシュボードに戻りましょう。",
        side: "bottom",
        align: "start",
        doneBtnText: "ダッシュボードへ戻る",
      },
    },
  },
];

export const recordDetailIntroSteps: DriveStep[] = toDriveSteps(
  recordDetailIntroStepDefinitions,
);

export const recordDetailReturnSteps: DriveStep[] = toDriveSteps(
  recordDetailReturnStepDefinitions,
);

/** 後方互換性用（全ステップ統合版） */
export const recordDetailStepDefinitions: OnboardingStep[] = [
  ...recordDetailIntroStepDefinitions,
  ...recordDetailReturnStepDefinitions,
];

export const recordDetailSteps: DriveStep[] = toDriveSteps(
  recordDetailStepDefinitions,
);

/**
 * ダッシュボード（後半）：お守りシートと利用開始案内
 */
export const dashboardPart2StepDefinitions: OnboardingStep[] = [
  {
    type: "slide",
    title: "もしもの時のお守り：リカバリーシート",
    description:
      "万が一合言葉を忘れても安心！後から「家族管理」で紙に印刷できるお守り（復旧用シート）をいつでも発行できます。",
    imageSlot: {
      id: "recovery-kit-paper",
      role: "合言葉を忘れた時でも復旧できる紙のお守りシート",
      badgeText: "もしものお守り",
      aspectRatio: "4/3",
    },
    nextBtnText: "次へ",
    prevBtnText: "戻る",
  },
  {
    type: "spotlight",
    driveStep: {
      element: '[data-tour="user-menu"]',
      popover: {
        title: "お守りシートの発行場所",
        description:
          "右上のアカウントメニューから「家族管理」を開くと、いつでもリカバリーシートを発行・印刷できます。<br />大切な合言葉を忘れてしまう前に、印刷して保管しておくのがおすすめです。",
        side: "bottom",
        align: "end",
        nextBtnText: "次へ",
      },
    },
  },
  {
    type: "spotlight",
    driveStep: {
      element: '[data-tour="add-record"]',
      popover: {
        title: "さあ、使ってみましょう！",
        description:
          "右上の「＋追加」からアカウントを新しく登録できます。<br />このサンプルは上のバナーからいつでも消せます。",
        side: "bottom",
        align: "end",
        doneBtnText: "ツアーを完了する",
      },
    },
  },
];

export const dashboardPart2Steps: DriveStep[] = toDriveSteps(
  dashboardPart2StepDefinitions,
);

/**
 * 手動起動用ダッシュボードガイドツアー（サンプルデータ不要）
 * 既存のUI要素（新規登録、検索、タグ、アカウント切替、設定）を案内
 */
export const manualDashboardSteps: DriveStep[] = [
  {
    element: '[data-tour="add-record"]',
    popover: {
      title: "新しいサービスを登録",
      description:
        "家族で共有したいアカウントや、自分専用のパスワードヒントを登録できます。",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: '[data-tour="search-input"]',
    popover: {
      title: "すばやく検索",
      description:
        "サービス名やタグ、メモのキーワードで登録したアカウントを検索できます。",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="tag-cloud"]',
    popover: {
      title: "タグで絞り込み",
      description:
        "「金融」「エンタメ」などタグを付けておくと、ワンタップで整理・表示できます。",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="user-menu"]',
    popover: {
      title: "アカウントと家族の管理",
      description:
        "別アカウントへの切り替えや、家族の合言葉・メンバーの管理はこちらから行えます。",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: '[data-tour="user-menu"]',
    popover: {
      title: "設定とセキュリティ",
      description:
        "生体認証（指紋・顔認証）の設定や、緊急時のリカバリーキットを発行できます。",
      side: "bottom",
      align: "end",
    },
  },
];

/**
 * 家族作成・参加完了画面（/family）：ダッシュボード誘導ツアーステップ
 */
export const familyCreatedStepDefinitions: OnboardingStep[] = [
  {
    type: "spotlight",
    driveStep: {
      element: '[data-tour="app-logo"]',
      popover: {
        title: "家族グループができました！ 🎉",
        description:
          "家族の準備が整いました。<br />ダッシュボードへ移動して、サービスの登録や体験ツアーを始めましょう！",
        side: "bottom",
        align: "start",
        popoverClass: "poohma-tour-popover poohma-tour-family-welcome",
        doneBtnText: "ダッシュボードへ",
        prevBtnText: "家族設定を見る",
      },
    },
  },
];

export const familyCreatedSteps: DriveStep[] = toDriveSteps(
  familyCreatedStepDefinitions,
);
