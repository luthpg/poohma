import type { DriveStep } from "driver.js";
import { useCallback, useEffect, useRef } from "react";
import "./onboarding.css";

interface OnboardingTourProps {
	steps: DriveStep[];
	isActive: boolean;
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
	onComplete,
	onClose,
}: OnboardingTourProps) {
	const driverRef = useRef<ReturnType<
		typeof import("driver.js").driver
	> | null>(null);
	const isDestroyedRef = useRef(false);

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
		if (!isActive || steps.length === 0) return;

		let cancelled = false;

		const initDriver = async () => {
			const { driver } = await import("driver.js");

			if (cancelled) return;

			isDestroyedRef.current = false;
			const driverObj = driver({
				showProgress: true,
				animate: true,
				allowClose: false,
				overlayColor: "rgba(0, 0, 0, 0.5)",
				stagePadding: 8,
				stageRadius: 12,
				popoverClass: "poohma-tour-popover",
				nextBtnText: "次へ",
				prevBtnText: "戻る",
				doneBtnText: "完了",
				progressText: "{{current}} / {{total}}",
				steps,
				onCloseClick: () => {
					destroyDriver();
					onClose();
				},
				onDestroyStarted: () => {
					// 最終ステップで「完了」を押した場合
					if (driverObj.isLastStep()) {
						destroyDriver();
						onComplete();
					} else {
						destroyDriver();
						onClose();
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
	}, [isActive, steps, onComplete, onClose, destroyDriver]);

	// アンマウント時のクリーンアップ
	useEffect(() => {
		return () => {
			destroyDriver();
		};
	}, [destroyDriver]);

	return null;
}
