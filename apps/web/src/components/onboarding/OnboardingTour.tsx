import type { DriveStep } from "driver.js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toDriveSteps } from "@/lib/onboarding/tours";
import type { OnboardingStep } from "@/lib/onboarding/types";
import "./onboarding.css";

interface OnboardingTourProps {
  steps: OnboardingStep[] | DriveStep[];
  isActive: boolean;
  allowClose?: boolean;
  onComplete: () => void;
  onClose: () => void;
}

/**
 * Driver.js のライフサイクルを管理するコンポーネント
 * driver.js は動的インポートし、初回バンドルサイズを肥大化させない
 */
export function OnboardingTour({
  steps,
  isActive,
  allowClose = false,
  onComplete,
  onClose,
}: OnboardingTourProps) {
  const driverRef = useRef<ReturnType<
    typeof import("driver.js").driver
  > | null>(null);
  const isDestroyedRef = useRef(false);
  const isFinishedByDoneRef = useRef(false);
  const isClosedByUserRef = useRef(false);

  // コールバックの最新参照を保持（親の再レンダリングによる useEffect 再実行・即時破棄を防止）
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // steps が OnboardingStep[] の場合も含めて正規化
  const normalizedSteps = useMemo<DriveStep[]>(() => {
    if (steps.length === 0) return [];
    // 最初の要素が OnboardingStep (type プロパティを持つ) かチェック
    const isCustomSteps = typeof (steps[0] as OnboardingStep).type === "string";
    if (isCustomSteps) {
      return toDriveSteps(steps as OnboardingStep[]);
    }
    return steps as DriveStep[];
  }, [steps]);

  const destroyDriver = useCallback(() => {
    if (driverRef.current && !isDestroyedRef.current) {
      isDestroyedRef.current = true;
      try {
        driverRef.current.destroy();
      } catch {
        // destroy may throw if already destroyed
      }
      driverRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isActive || normalizedSteps.length === 0) return;

    let cancelled = false;
    isFinishedByDoneRef.current = false;
    isClosedByUserRef.current = false;

    const initDriver = async () => {
      const { driver } = await import("driver.js");

      if (cancelled) return;

      isDestroyedRef.current = false;
      const driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose,
        showButtons: ["next", "previous", "close"],
        overlayColor: "rgba(0, 0, 0, 0.5)",
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: "poohma-tour-popover",
        nextBtnText: "次へ",
        prevBtnText: "戻る",
        doneBtnText: "完了",
        progressText: "{{current}} / {{total}}",
        steps: normalizedSteps,
        onPopoverRender: (popover, opts) => {
          if (popover.closeButton) {
            popover.closeButton.setAttribute("aria-label", "ツアーを終了");
            popover.closeButton.setAttribute("title", "ツアーを終了");
          }
          // 最終ステップの「完了」ボタンがクリックされたことを確実に追跡
          if (opts.driver.isLastStep() && popover.nextButton) {
            popover.nextButton.addEventListener(
              "click",
              () => {
                isFinishedByDoneRef.current = true;
              },
              { once: true },
            );
          }
        },
        onCloseClick: () => {
          isClosedByUserRef.current = true;
          destroyDriver();
          onCloseRef.current();
        },
        onDestroyStarted: () => {
          if (isClosedByUserRef.current) return;
          const isDone = isFinishedByDoneRef.current || driverObj.isLastStep();
          destroyDriver();
          if (isDone) {
            onCompleteRef.current();
          } else {
            onCloseRef.current();
          }
        },
      });

      driverRef.current = driverObj;
      driverObj.drive();
    };

    initDriver();

    return () => {
      cancelled = true;
      destroyDriver();
    };
  }, [isActive, normalizedSteps, allowClose, destroyDriver]);

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      destroyDriver();
    };
  }, [destroyDriver]);

  return null;
}
