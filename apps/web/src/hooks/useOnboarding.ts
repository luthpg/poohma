import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { usePasscode } from "@/components/PasscodeProvider";
import { useAccount } from "@/hooks/useAccount";
import {
	encryptSampleRecords,
	SAMPLE_RECORDS,
} from "@/lib/onboarding/sampleData";
import type { OnboardingPhase } from "@/lib/onboarding/types";

const ONBOARDING_CURRENT_VERSION = 1;

// ダッシュボードの SearchParams の型を定義
export interface DashboardSearchParams {
	q?: string;
	tag?: string;
	sort?:
		| "name-asc"
		| "name-desc"
		| "url-asc"
		| "url-desc"
		| "date-asc"
		| "date-desc"
		| "updatedAt-asc"
		| "updatedAt-desc";
	view?: "card" | "list";
	onboarding?: string;
}

/**
 * オンボーディングの状態管理・画面間遷移を統括するフック
 *
 * ## 責務
 * - onboardingVersion に基づくフェーズ判定（モーダル表示 / スキップ / 完了済み）
 * - サンプルデータの暗号化投入 → ダッシュボードツアー → 詳細画面遷移 → 帰還ツアー
 * - サンプルデータの一括削除
 * - ツアー再開
 */
export function useOnboarding() {
	const { activeAccount } = useAccount();
	const { getMasterKey, requireUnlock } = usePasscode();
	const navigate = useNavigate();
	const completeOnboardingMutation = useMutation(
		api.onboarding.completeOnboarding,
	);
	const insertSampleRecordsMutation = useMutation(
		api.onboarding.insertSampleRecords,
	);
	const purgeSampleDataMutation = useMutation(api.onboarding.purgeSampleData);

	const [phase, setPhase] = useState<OnboardingPhase>("idle");
	const [isLoading, setIsLoading] = useState(false);
	const [isPurging, setIsPurging] = useState(false);
	const sampleRecordIdsRef = useRef<Id<"serviceRecords">[]>([]);

	// オンボーディング未完了かどうか
	const needsOnboarding = useMemo(() => {
		if (!activeAccount) return false;
		// 家族未所属 → オンボーディングの対象外（家族作成後に初めて発動）
		if (!activeAccount.familyId) return false;
		const version = activeAccount.onboardingVersion ?? 0;
		return version < ONBOARDING_CURRENT_VERSION;
	}, [activeAccount]);

	/**
	 * URLの `onboarding` クエリパラメータを型安全に除去する
	 */
	const clearOnboardingQuery = useCallback(() => {
		navigate({
			to: "/dashboard",
			search: (prev: Record<string, unknown>): DashboardSearchParams => {
				const next = { ...prev };
				delete next.onboarding;
				return next as DashboardSearchParams;
			},
			replace: true,
		});
	}, [navigate]);

	// サンプルデータが存在するか（家族内に isSample=true のレコードがある場合、バナーを表示）
	// この判定は呼び出し側（dashboard）で Convex クエリ結果から行う
	// フックでは hasSampleData を外部から受け取る形にする

	/**
	 * モーダルを表示（初回ダッシュボード到達時に呼ばれる）
	 */
	const showModal = useCallback(() => {
		if (needsOnboarding) {
			setPhase("modal");
		}
	}, [needsOnboarding]);

	/**
	 * 「スキップして空のまま始める」
	 */
	const skipOnboarding = useCallback(async () => {
		setIsLoading(true);
		try {
			await completeOnboardingMutation({
				accountId: activeAccount?._id,
				version: ONBOARDING_CURRENT_VERSION,
			});
			setPhase("completed");
			clearOnboardingQuery();
		} catch (e) {
			console.error("Failed to skip onboarding:", e);
			toast.error("スキップに失敗しました。もう一度お試しください。");
		} finally {
			setIsLoading(false);
		}
	}, [activeAccount?._id, completeOnboardingMutation, clearOnboardingQuery]);

	/**
	 * 「サンプルデータで体験してみる」
	 * 1. masterKey を取得（ロック中なら合言葉プロンプトを表示）
	 * 2. クライアント側でサンプルデータを暗号化
	 * 3. Convex に投入
	 * 4. ダッシュボードツアー（前半）を開始
	 */
	const startTour = useCallback(async () => {
		setIsLoading(true);
		try {
			// masterKey 取得（ロック中ならプロンプト）
			let masterKey = getMasterKey();
			if (!masterKey) {
				const unlocked = await requireUnlock();
				if (!unlocked) {
					setIsLoading(false);
					return;
				}
				masterKey = getMasterKey();
			}
			if (!masterKey) {
				toast.error("合言葉の確認に失敗しました。");
				setIsLoading(false);
				return;
			}

			// クライアント暗号化
			const encryptedRecords = await encryptSampleRecords(
				SAMPLE_RECORDS,
				masterKey,
			);

			// Convex 投入
			const result = await insertSampleRecordsMutation({
				accountId: activeAccount?._id,
				records: encryptedRecords,
			});
			sampleRecordIdsRef.current = result.recordIds;

			// ダッシュボードツアー（前半）開始
			setPhase("dashboard-tour-1");
		} catch (e) {
			console.error("Failed to start onboarding tour:", e);
			toast.error(
				"サンプルデータの作成に失敗しました。もう一度お試しください。",
			);
		} finally {
			setIsLoading(false);
		}
	}, [
		getMasterKey,
		requireUnlock,
		activeAccount?._id,
		insertSampleRecordsMutation,
	]);

	/**
	 * ダッシュボードツアー（前半）完了 → 詳細画面へナビゲート
	 */
	const onDashboardTour1Complete = useCallback(
		(fallbackSampleId?: Id<"serviceRecords">) => {
			const targetSampleId = sampleRecordIdsRef.current[0] || fallbackSampleId;
			if (targetSampleId) {
				setPhase("detail-tour");
				navigate({
					to: "/records/$id",
					params: { id: targetSampleId },
					search: { onboarding: "detail" },
				});
			} else {
				setPhase("completed");
				clearOnboardingQuery();
			}
		},
		[navigate, clearOnboardingQuery],
	);

	/**
	 * 詳細画面ツアー完了 → ダッシュボードに戻り、後半ツアー開始
	 */
	const onDetailTourComplete = useCallback(() => {
		setPhase("dashboard-tour-2");
		navigate({
			to: "/dashboard",
			search: (prev: Record<string, unknown>): DashboardSearchParams => ({
				...(prev as DashboardSearchParams),
				onboarding: "part2",
			}),
		});
	}, [navigate]);

	/**
	 * ダッシュボードツアー（後半）完了 → オンボーディング完了
	 */
	const onDashboardTour2Complete = useCallback(async () => {
		try {
			await completeOnboardingMutation({
				accountId: activeAccount?._id,
				version: ONBOARDING_CURRENT_VERSION,
			});
			setPhase("completed");
			clearOnboardingQuery();
			toast.success("ツアーが完了しました！自由にお使いください。");
		} catch (e) {
			console.error("Failed to complete onboarding:", e);
			toast.error("ツアー完了状態の保存に失敗しました。");
		}
	}, [activeAccount?._id, completeOnboardingMutation, clearOnboardingQuery]);

	/**
	 * ツアーの途中離脱（×ボタン）
	 */
	const onTourClose = useCallback(() => {
		setPhase("completed");
		clearOnboardingQuery();
	}, [clearOnboardingQuery]);

	/**
	 * ツアーを再開
	 */
	const restartTour = useCallback(() => {
		setPhase("dashboard-tour-1");
	}, []);

	/**
	 * サンプルデータを一括削除
	 */
	const purgeSamples = useCallback(async () => {
		setIsPurging(true);
		try {
			const result = await purgeSampleDataMutation({
				accountId: activeAccount?._id,
			});
			sampleRecordIdsRef.current = [];
			toast.success(`${result.deletedCount}件のサンプルデータを削除しました。`);
		} catch (e) {
			console.error("Failed to purge sample data:", e);
			toast.error("サンプルデータの削除に失敗しました。");
		} finally {
			setIsPurging(false);
		}
	}, [activeAccount?._id, purgeSampleDataMutation]);

	/**
	 * サンプルデータ不要の手動機能ツアーを開始
	 */
	const startManualTour = useCallback(() => {
		setPhase("manual-tour");
	}, []);

	/**
	 * データが既存の場合などにバックグラウンドでオンボーディング完了をマーク
	 */
	const markCompleted = useCallback(async () => {
		try {
			await completeOnboardingMutation({
				accountId: activeAccount?._id,
				version: ONBOARDING_CURRENT_VERSION,
			});
			setPhase("completed");
			clearOnboardingQuery();
		} catch (e) {
			console.error("Failed to mark onboarding completed:", e);
		}
	}, [activeAccount?._id, completeOnboardingMutation, clearOnboardingQuery]);

	/**
	 * URLクエリパラメータからフェーズを復元（画面遷移後の再開用）
	 */
	const resumeFromQuery = useCallback((queryParam?: string): boolean => {
		if (queryParam === "detail") {
			setPhase("detail-tour");
			return true;
		}
		if (queryParam === "part2") {
			setPhase("dashboard-tour-2");
			return true;
		}
		if (queryParam === "guide") {
			setPhase("manual-tour");
			return true;
		}
		return false;
	}, []);

	return {
		phase,
		needsOnboarding,
		isLoading,
		isPurging,
		sampleRecordIds: sampleRecordIdsRef.current,
		// アクション
		showModal,
		skipOnboarding,
		startTour,
		startManualTour,
		markCompleted,
		onDashboardTour1Complete,
		onDetailTourComplete,
		onDashboardTour2Complete,
		onTourClose,
		restartTour,
		purgeSamples,
		resumeFromQuery,
		clearOnboardingQuery,
	};
}
