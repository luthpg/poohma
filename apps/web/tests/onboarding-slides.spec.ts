import { describe, expect, it } from "vitest";
import { renderSlideHtml } from "@/lib/onboarding/renderSlide";
import {
  dashboardPart1StepDefinitions,
  dashboardPart1Steps,
  dashboardPart2StepDefinitions,
  dashboardPart2Steps,
  familyCreatedStepDefinitions,
  familyCreatedSteps,
  recordDetailIntroSteps,
  recordDetailReturnSteps,
  recordDetailStepDefinitions,
  recordDetailSteps,
  toDriveSteps,
} from "@/lib/onboarding/tours";
import type { OnboardingStep } from "@/lib/onboarding/types";

describe("Onboarding Tour 概念説明スライドと Driver.js 変換", () => {
  describe("renderSlideHtml", () => {
    it("インフォグラフィックを含むスライドのHTMLが正しく生成され、BudouX禁則改行が適用されること", () => {
      const slideStep: Extract<OnboardingStep, { type: "slide" }> = {
        type: "slide",
        title: "テストタイトル",
        description:
          "テスト説明文です。<script>危険</script>家族で使っているサービスを安全にまとめられます。",
        imageSlot: {
          id: "welcome-family-share",
          role: "家族で安心共有の全体像",
          badgeText: "アプリ概要",
          aspectRatio: "16/9",
        },
      };

      const html = renderSlideHtml(slideStep);

      // インフォグラフィックが含まれていること
      expect(html).toContain("poohma-infographic infographic-welcome");
      expect(html).toContain("動画配信");
      expect(html).toContain("共有中");
      expect(html).toContain("自分のみ");

      // アクセシビリティ (role="img" と aria-label) が正しく設定されていること
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="家族で安心共有の全体像"');

      // XSSエスケープが行われていること
      expect(html).toContain("&lt;script&gt;危険&lt;/script&gt;");
      expect(html).not.toContain("<script>危険</script>");

      // BudouX禁則改行 <wbr/> が含まれていること
      expect(html).toContain("<wbr/>");

      // 説明文コンテナが含まれていること
      expect(html).toContain("poohma-tour-slide-text");
    });

    it("画像スロットの role に特殊文字が含まれている場合でも属性値が安全にエスケープされること", () => {
      const slideStep: Extract<OnboardingStep, { type: "slide" }> = {
        type: "slide",
        title: "エスケープテスト",
        description: "説明文",
        imageSlot: {
          id: "e2ee-secret-lock",
          role: 'テスト "クォート" & <タグ>',
        },
      };

      const html = renderSlideHtml(slideStep);
      expect(html).toContain(
        'aria-label="テスト &quot;クォート&quot; &amp; &lt;タグ&gt;"',
      );
      expect(html).not.toContain('aria-label="テスト "クォート" & <タグ>"');
    });

    it("画像スロットがないスライドでも安全に説明文が出力されること", () => {
      const slideStep: Extract<OnboardingStep, { type: "slide" }> = {
        type: "slide",
        title: "画像なしスライド",
        description: "シンプルなテキストのみの説明です。",
      };

      const html = renderSlideHtml(slideStep);
      expect(html).not.toContain("poohma-infographic");
      expect(html).toContain("シンプルな");
      expect(html).toContain("<wbr/>");
    });
  });

  describe("toDriveSteps", () => {
    it("スライド型ステップとSpotlight型ステップが正しくDriveStepへ変換されること", () => {
      const inputSteps: OnboardingStep[] = [
        {
          type: "slide",
          title: "スライド1",
          description: "説明文1",
          nextBtnText: "進む",
          prevBtnText: "戻る",
        },
        {
          type: "spotlight",
          driveStep: {
            element: '[data-tour="target-elem"]',
            popover: {
              title: "スポットライト1",
              description: "要素を強調します",
            },
          },
        },
      ];

      const driveSteps = toDriveSteps(inputSteps);
      expect(driveSteps).toHaveLength(2);

      // 1ステップ目（スライド）: element なし、中央モーダル用クラス付与
      expect(driveSteps[0].element).toBeUndefined();
      expect(driveSteps[0].popover?.title).toBe("スライド1");
      expect(driveSteps[0].popover?.popoverClass).toContain(
        "poohma-tour-slide",
      );
      expect(driveSteps[0].popover?.nextBtnText).toBe("進む");
      expect(driveSteps[0].popover?.prevBtnText).toBe("戻る");

      // 2ステップ目（スポットライト）: element あり、既存設定を維持
      expect(driveSteps[1].element).toBe('[data-tour="target-elem"]');
      expect(driveSteps[1].popover?.title).toBe("スポットライト1");
    });
  });

  describe("初心者向け7ステップツアー定義の検証", () => {
    it("ダッシュボード前半が2ステップ（スライド1 + スポットライト1）で構成されていること", () => {
      expect(dashboardPart1StepDefinitions).toHaveLength(2);
      expect(dashboardPart1Steps).toHaveLength(2);

      // Step 1: スライド（welcome-family-share）
      expect(dashboardPart1StepDefinitions[0].type).toBe("slide");
      if (dashboardPart1StepDefinitions[0].type === "slide") {
        expect(dashboardPart1StepDefinitions[0].imageSlot?.id).toBe(
          "welcome-family-share",
        );
      }

      // Step 2: スポットライト（sample-record）
      expect(dashboardPart1StepDefinitions[1].type).toBe("spotlight");
      expect(dashboardPart1Steps[1].element).toBe(
        '[data-tour="sample-record"]',
      );
    });

    it("レコード詳細画面が4ステップ（スライド1 + アクション1 + 復号ヒント1 + 戻る1）で構成されていること", () => {
      expect(recordDetailStepDefinitions).toHaveLength(4);
      expect(recordDetailSteps).toHaveLength(4);

      // Step 1: スライド（e2ee-secret-lock）
      expect(recordDetailStepDefinitions[0].type).toBe("slide");
      if (recordDetailStepDefinitions[0].type === "slide") {
        expect(recordDetailStepDefinitions[0].imageSlot?.id).toBe(
          "e2ee-secret-lock",
        );
      }

      // Step 2: スポットライト（hint-reveal-btn）
      expect(recordDetailSteps[1].element).toBe(
        '[data-tour="hint-reveal-btn"]',
      );

      // Step 3: スポットライト（decrypted-hint）
      expect(recordDetailSteps[2].element).toBe('[data-tour="decrypted-hint"]');

      // Step 4: スポットライト（back-to-dashboard）
      expect(recordDetailSteps[3].element).toBe(
        '[data-tour="back-to-dashboard"]',
      );

      // 分割ツアー（導入編2ステップ + 帰還編2ステップ）としても正しく構成されていること
      expect(recordDetailIntroSteps).toHaveLength(2);
      expect(recordDetailIntroSteps[1].element).toBe(
        '[data-tour="hint-reveal-btn"]',
      );
      expect(recordDetailReturnSteps).toHaveLength(2);
      expect(recordDetailReturnSteps[0].element).toBe(
        '[data-tour="decrypted-hint"]',
      );
      expect(recordDetailReturnSteps[1].element).toBe(
        '[data-tour="back-to-dashboard"]',
      );
    });

    it("ダッシュボード後半が3ステップ（スライド1 + スポットライト2）で構成されていること", () => {
      expect(dashboardPart2StepDefinitions).toHaveLength(3);
      expect(dashboardPart2Steps).toHaveLength(3);

      // Step 1: スライド（recovery-kit-paper）
      expect(dashboardPart2StepDefinitions[0].type).toBe("slide");
      if (dashboardPart2StepDefinitions[0].type === "slide") {
        expect(dashboardPart2StepDefinitions[0].imageSlot?.id).toBe(
          "recovery-kit-paper",
        );
      }

      // Step 2: スポットライト（user-menu: お守りシート発行場所）
      expect(dashboardPart2Steps[1].element).toBe('[data-tour="user-menu"]');

      // Step 3: スポットライト（add-record: 新規登録）
      expect(dashboardPart2Steps[2].element).toBe('[data-tour="add-record"]');
    });

    it("全3箇所の画像スケルトンが明確な役割を持っていること", () => {
      const allDefinitions = [
        ...dashboardPart1StepDefinitions,
        ...recordDetailStepDefinitions,
        ...dashboardPart2StepDefinitions,
      ];

      const imageSlots = allDefinitions
        .filter(
          (s): s is Extract<OnboardingStep, { type: "slide" }> =>
            s.type === "slide",
        )
        .map((s) => s.imageSlot)
        .filter(Boolean);

      expect(imageSlots).toHaveLength(3);

      const slotIds = imageSlots.map((s) => s?.id);
      expect(slotIds).toEqual([
        "welcome-family-share",
        "e2ee-secret-lock",
        "recovery-kit-paper",
      ]);

      // 各役割テキストが空でなく意味のある説明になっていること
      for (const slot of imageSlots) {
        expect(slot?.role).toBeTruthy();
        expect(slot?.role.length).toBeGreaterThan(5);
      }
    });

    it("家族作成・参加直後のダッシュボード誘導ツアーステップが1ステップで構成されていること", () => {
      expect(familyCreatedStepDefinitions).toHaveLength(1);
      expect(familyCreatedSteps).toHaveLength(1);

      expect(familyCreatedStepDefinitions[0].type).toBe("spotlight");
      expect(familyCreatedSteps[0].element).toBe('[data-tour="app-logo"]');
      expect(familyCreatedSteps[0].popover?.title).toContain(
        "家族グループができました！",
      );
      expect(familyCreatedSteps[0].popover?.doneBtnText).toBe(
        "ダッシュボードへ移動する",
      );
      expect(familyCreatedSteps[0].popover?.prevBtnText).toBe(
        "このまま家族設定を見る",
      );
    });
  });
});
