import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  Globe,
  LayoutGrid,
  List,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  type SubmitEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { IndexScrollBar } from "@/components/IndexScrollBar";
import { OnboardingBanner } from "@/components/onboarding/OnboardingBanner";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { BulkAdminModal } from "@/components/records/BulkAdminModal";
import { BulkVisibilityModal } from "@/components/records/BulkVisibilityModal";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/ui/tag-input";
import { useAccount } from "@/hooks/useAccount";
import { useOnboarding } from "@/hooks/useOnboarding";
import { usePersistentQuery } from "@/hooks/usePersistentQuery";
import {
  dashboardPart1Steps,
  dashboardPart2Steps,
  manualDashboardSteps,
} from "@/lib/onboarding/tours";
import { cn } from "@/lib/utils";
import {
  getDashboardPrefs,
  setDashboardPrefs,
} from "@/services/prefs.functions";
import { groupRecordsByIndex } from "@/utils/index-group";

const searchSchema = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
  sort: z
    .enum([
      "name-asc",
      "name-desc",
      "url-asc",
      "url-desc",
      "date-asc",
      "date-desc",
      "updatedAt-asc",
      "updatedAt-desc",
    ])
    .optional(),
  view: z.enum(["card", "list"]).optional(),
  onboarding: z.string().optional(),
});

export const Route = createFileRoute("/(app)/dashboard")({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const prefs = await getDashboardPrefs();
    return { prefs };
  },
  loaderDeps: ({ search: { q, tag, sort, view } }) => ({ q, tag, sort, view }),
  loader: async ({ context, deps: { q, tag, sort, view } }) => {
    return {
      user: context.user ?? null,
      prefs: context.prefs,
      searchParams: { q, tag, sort, view },
    };
  },
  component: RouteComponent,
});

// タグクラウド用のスケルトン
function TagCloudSkeleton() {
  return (
    <div className="mt-4 flex overflow-x-auto py-1.5 gap-2.5 no-scrollbar scroll-smooth items-center">
      <Skeleton className="h-[28px] w-16 rounded-full" />
      <Skeleton className="h-[28px] w-20 rounded-full" />
      <Skeleton className="h-[28px] w-14 rounded-full" />
      <Skeleton className="h-[28px] w-18 rounded-full" />
    </div>
  );
}

/**
 * 利用可能なタグを表示し、選択されたタグを通知するタグクラウド。
 */
function TagCloud({
  activeTag,
  onTagClick,
}: {
  activeTag: string | undefined;
  onTagClick: (tag: string) => void;
}) {
  const { activeAccountId } = useAccount();
  const availableTags = usePersistentQuery<string[]>(
    api.records.getAvailableTags,
    { accountId: activeAccountId || undefined },
  );

  if (availableTags === undefined) return <TagCloudSkeleton />;
  const validTags = Array.isArray(availableTags)
    ? availableTags.filter((t): t is string => typeof t === "string")
    : [];
  if (validTags.length === 0) return null;

  return (
    <div className="mt-4 flex overflow-x-auto py-1.5 gap-2.5 no-scrollbar scroll-smooth items-center">
      {validTags.map((t: string) => {
        const isActive = activeTag === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onTagClick(t)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200 ${
              isActive
                ? "bg-orange-500 text-white shadow-md scale-105"
                : "bg-card text-muted-foreground border border-border/40 shadow-sm hover:border-orange-500/50 hover:text-orange-500 hover:bg-orange-500/5"
            }`}
          >
            #{t}
          </button>
        );
      })}
    </div>
  );
}

// レコード一覧用のスケルトン
function RecordListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Skeleton component uses index as key
          key={i}
          className="flex flex-row md:flex-col overflow-hidden rounded-lg bg-card shadow-card block border border-border/50"
        >
          <Skeleton className="aspect-square w-28 shrink-0 md:aspect-video md:w-full rounded-none" />
          <div className="flex flex-1 flex-col justify-center p-3 md:p-4 gap-2 md:gap-4">
            <Skeleton className="h-5 md:h-6 w-3/4" />
            <div className="flex gap-1">
              <Skeleton className="h-4 md:h-5 w-12 rounded-full" />
              <Skeleton className="h-4 md:h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-auto hidden h-[34px] w-full rounded-md md:block" />
          </div>
        </div>
      ))}
    </div>
  );
}

const routeApi = getRouteApi("/(app)/dashboard");

type SortParam =
  | "name-asc"
  | "name-desc"
  | "url-asc"
  | "url-desc"
  | "date-asc"
  | "date-desc"
  | "updatedAt-asc"
  | "updatedAt-desc";

function RouteComponent() {
  const { prefs, searchParams } = routeApi.useLoaderData();
  const navigate = useNavigate({ from: "/dashboard" });

  const sortParam =
    (searchParams.sort as SortParam) || (prefs.sort as SortParam) || "name-asc";

  const [searchInput, setSearchInput] = useState(searchParams.q || "");
  useEffect(() => {
    setSearchInput(searchParams.q || "");
  }, [searchParams.q]);

  // --- オンボーディング ---
  const { activeAccountId } = useAccount();
  const records = usePersistentQuery<
    NonNullable<typeof api.records.getRecords._returnType>
  >(api.records.getRecords, {
    accountId: activeAccountId || undefined,
  });
  const family = useQuery(api.families.getFamilyMembers, {
    accountId: activeAccountId || undefined,
  });
  const onboarding = useOnboarding();
  const onboardingInitRef = useRef(false);
  const onboardingSearch = useSearch({ from: "/(app)/dashboard" });

  // 通常データ（非サンプル）が存在するか
  const hasRealRecords = useMemo(
    () =>
      records
        ? records.some(
            (r: (typeof records)[number]) =>
              !(r as { isSample?: boolean }).isSample,
          )
        : false,
    [records],
  );

  const firstSampleRecord = useMemo(
    () =>
      records?.find((r) => (r as RecordType & { isSample?: boolean }).isSample),
    [records],
  );

  // 初回表示時にモーダルを表示、またはURLクエリから復帰
  useEffect(() => {
    if (onboardingSearch.onboarding) {
      const resumed = onboarding.resumeFromQuery(onboardingSearch.onboarding);
      if (resumed) return;
    }

    // レコードの取得完了を待機
    if (records === undefined) return;
    if (onboardingInitRef.current) return;
    onboardingInitRef.current = true;

    // 既に通常データが存在するユーザー・家族はモーダルを出さず完了済みにマーク
    if (hasRealRecords) {
      if (onboarding.needsOnboarding) {
        onboarding.markCompleted();
      }
      return;
    }

    // データが1件もない完全新規の家族・アカウントのみ初回体験モーダルを表示
    if (onboarding.needsOnboarding && records && records.length === 0) {
      onboarding.showModal();
    }
  }, [
    records,
    hasRealRecords,
    onboardingSearch.onboarding,
    onboarding.needsOnboarding,
    onboarding.showModal,
    onboarding.markCompleted,
    onboarding.resumeFromQuery,
  ]);
  const viewMode = (searchParams.view || prefs.view || "card") as
    | "card"
    | "list";

  const handleViewModeChange = (newMode: "card" | "list") => {
    setDashboardPrefs({ view: newMode });
    navigate({
      search: (prev) => ({
        ...prev,
        view: newMode === "card" ? undefined : newMode, // card is default, save url space
      }),
    });
  };

  const handleSortChange = (newSort: SortParam) => {
    setDashboardPrefs({ sort: newSort });
    navigate({
      search: (prev) => ({
        ...prev,
        sort: newSort,
      }),
    });
  };

  const handleSearch = (e: SubmitEvent) => {
    e.preventDefault();
    navigate({
      search: (prev) => ({
        ...prev,
        q: searchInput || undefined,
      }),
    });
  };

  const handleTagClick = (tag: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        tag: tag === searchParams.tag ? undefined : tag, // Toggle tag
      }),
    });
  };

  // 一括操作用状態
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeModal, setActiveModal] = useState<
    "tag" | "visibility" | "admin" | "delete" | null
  >(null);
  const [bulkTagInput, setBulkTagInput] = useState<string[]>([]);

  // 選択中レコードの情報・内訳
  const selectedRecords = useMemo(
    () => records?.filter((r) => selectedIds.includes(r._id)) ?? [],
    [records, selectedIds],
  );

  const selectedPrivateCount = useMemo(
    () => selectedRecords.filter((r) => r.ownerType === "user").length,
    [selectedRecords],
  );

  const selectedSharedCount = useMemo(
    () => selectedRecords.filter((r) => r.ownerType === "family").length,
    [selectedRecords],
  );

  // 共有解除可能なレコード（自分が管理者である家族共有レコード）
  const unshareableRecords = useMemo(
    () =>
      selectedRecords.filter(
        (r) =>
          r.ownerType === "family" &&
          Boolean(
            activeAccountId && (r.admins ?? []).includes(activeAccountId),
          ),
      ),
    [selectedRecords, activeAccountId],
  );

  // 管理者権限がないため共有解除の対象外となるレコード
  const excludedUnshareRecords = useMemo(
    () =>
      selectedRecords
        .filter(
          (r) =>
            r.ownerType === "family" &&
            !(activeAccountId && (r.admins ?? []).includes(activeAccountId)),
        )
        .map((r) => ({ id: r._id, title: r.title })),
    [selectedRecords, activeAccountId],
  );

  const deleteRecordsMut = useMutation(api.records.deleteRecords);
  const bulkUpdateRecordsMut = useMutation(api.records.bulkUpdateRecords);
  const bulkShareMut = useMutation(api.records.bulkShareRecords);
  const bulkUnshareMut = useMutation(api.records.bulkUnshareRecords);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await deleteRecordsMut({
        accountId: activeAccountId || undefined,
        ids: selectedIds as Id<"serviceRecords">[],
      });
      toast.success(`${selectedIds.length} 件のレコードを削除しました`);
      setSelectedIds([]);
      setIsSelectMode(false);
      setActiveModal(null);
    } catch (_err) {
      toast.error("削除に失敗しました");
    }
  };

  const handleBulkTagAdd = async () => {
    if (selectedIds.length === 0) return;

    if (bulkTagInput.length === 0) {
      toast.error("タグを入力してください");
      return;
    }

    try {
      await bulkUpdateRecordsMut({
        accountId: activeAccountId || undefined,
        ids: selectedIds as Id<"serviceRecords">[],
        data: { tags: bulkTagInput },
      });
      toast.success(`${selectedIds.length} 件のレコードにタグを追加しました`);
      setBulkTagInput([]);
      setSelectedIds([]);
      setIsSelectMode(false);
      setActiveModal(null);
    } catch (_err) {
      toast.error("タグの追加に失敗しました");
    }
  };

  const handleBulkShare = async () => {
    if (selectedIds.length === 0) return;
    try {
      const result = await bulkShareMut({
        accountId: activeAccountId || undefined,
        ids: selectedIds as Id<"serviceRecords">[],
      });
      toast.success(`${result.count} 件のレコードを家族と共有しました`);
      setSelectedIds([]);
      setIsSelectMode(false);
      setActiveModal(null);
    } catch (_err: unknown) {
      toast.error("一括共有に失敗しました");
    }
  };

  const handleBulkUnshare = async () => {
    const targetIds = unshareableRecords.map(
      (r) => r._id as Id<"serviceRecords">,
    );
    if (targetIds.length === 0) {
      toast.error("共有解除可能なレコードがありません");
      return;
    }
    try {
      const result = await bulkUnshareMut({
        accountId: activeAccountId || undefined,
        ids: targetIds,
      });
      toast.success(`${result.count} 件のレコードの共有を解除しました`);
      setSelectedIds([]);
      setIsSelectMode(false);
      setActiveModal(null);
    } catch (_err: unknown) {
      toast.error("一括共有解除に失敗しました");
    }
  };

  return (
    <div
      className={cn(
        "mx-auto max-w-5xl p-6 relative",
        sortParam === "name-asc" && "pr-8 md:pr-6",
        isSelectMode && selectedIds.length > 0 && "pb-28",
      )}
    >
      {/* オンボーディングモーダル */}
      <OnboardingModal
        isOpen={onboarding.phase === "modal"}
        isLoading={onboarding.isLoading}
        onStartTour={onboarding.startTour}
        onSkip={onboarding.skipOnboarding}
      />

      {/* ダッシュボードツアー（前半: サンプルカード紹介） */}
      <OnboardingTour
        steps={dashboardPart1Steps}
        isActive={onboarding.phase === "dashboard-tour-1"}
        onComplete={() => {
          // sampleRecordIdsRef が空（リロード後など）でも、Convexから取得したサンプルIDで確実に詳細へ遷移させる
          onboarding.onDashboardTour1Complete(firstSampleRecord?._id);
        }}
        onClose={onboarding.onTourClose}
      />

      {/* ダッシュボードツアー（後半: 新規登録・バナー案内） */}
      <OnboardingTour
        steps={dashboardPart2Steps}
        isActive={onboarding.phase === "dashboard-tour-2"}
        onComplete={onboarding.onDashboardTour2Complete}
        onClose={onboarding.onTourClose}
      />

      {/* 手動機能ツアー（サンプルデータ不要） */}
      <OnboardingTour
        steps={manualDashboardSteps}
        isActive={onboarding.phase === "manual-tour"}
        onComplete={onboarding.onTourClose}
        onClose={onboarding.onTourClose}
      />
      {/* サンプルデータ表示中バナー */}
      <RecordListBannerSection
        onRestart={onboarding.restartTour}
        onPurge={onboarding.purgeSamples}
        isPurging={onboarding.isPurging}
      />

      {/* 検索・フィルターエリア */}
      <div className="mb-6">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              data-tour="search-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="タグやサービス名で検索..."
              className="w-full rounded-md bg-card pl-4 pr-10 py-2.5 h-10 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-shadow"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      q: undefined,
                    }),
                  });
                }}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-md bg-foreground px-4 py-2.5 h-10 w-20 text-[14px] font-medium text-background shadow-border hover:bg-foreground/90 transition cursor-pointer"
          >
            検索
          </button>
        </form>
        {/* タグクラウド (フィルター) - Suspense化 */}
        <div data-tour="tag-cloud">
          <Suspense fallback={<TagCloudSkeleton />}>
            <TagCloud
              activeTag={searchParams.tag}
              onTagClick={handleTagClick}
            />
          </Suspense>
        </div>
      </div>

      {/* レコード一覧 */}
      <RecordListSection
        searchParams={searchParams}
        sortParam={sortParam}
        viewMode={viewMode}
        handleTagClick={handleTagClick}
        handleSortChange={handleSortChange}
        handleViewModeChange={handleViewModeChange}
        isSelectMode={isSelectMode}
        setIsSelectMode={setIsSelectMode}
        selectedIds={selectedIds}
        onToggleSelect={(id) => {
          setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
          );
        }}
        onSelectAll={(ids) => setSelectedIds(ids)}
      />

      {/* フローティング一括操作アクションバー */}
      {isSelectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur border border-border shadow-lg px-4 sm:px-6 py-3 sm:py-3.5 rounded-xl flex items-center justify-between gap-3 sm:gap-6 z-30 w-[92%] sm:w-[90%] max-w-2xl animate-in slide-in-from-bottom-4 duration-300">
          <div className="text-[13px] sm:text-[14px] font-semibold text-foreground whitespace-nowrap shrink-0">
            {selectedIds.length} 件選択中
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar min-w-0 flex-1 justify-start py-0.5 overscroll-x-contain">
            <button
              type="button"
              onClick={() => setActiveModal("tag")}
              className="rounded-md bg-secondary hover:bg-accent px-3 py-2 h-9 text-[13px] font-medium text-foreground flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              <Tag className="h-4 w-4 text-orange-500" />
              タグ追加
            </button>
            <button
              type="button"
              onClick={() => setActiveModal("visibility")}
              className="rounded-md bg-secondary hover:bg-accent px-3 py-2 h-9 text-[13px] font-medium text-foreground flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              <Globe className="h-4 w-4 text-blue-500" />
              公開設定
            </button>
            {family && selectedSharedCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveModal("admin")}
                className="rounded-md bg-secondary hover:bg-accent px-3 py-2 h-9 text-[13px] font-medium text-foreground flex items-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4 text-orange-500" />
                管理者設定
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveModal("delete")}
              className="rounded-md bg-red-500/10 hover:bg-red-500/20 px-3 py-2 h-9 text-[13px] font-medium text-red-500 flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              削除
            </button>
            <div className="w-[1px] h-6 bg-border mx-1 shrink-0" />
            <button
              type="button"
              onClick={() => {
                setSelectedIds([]);
                setIsSelectMode(false);
              }}
              className="rounded-md bg-card hover:bg-secondary border border-border p-2 text-muted-foreground hover:text-foreground transition shrink-0 cursor-pointer"
              title="選択解除"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* タグ追加モーダル */}
      {activeModal === "tag" && (
        <BulkTagModal
          bulkTagInput={bulkTagInput}
          setBulkTagInput={setBulkTagInput}
          onSubmit={handleBulkTagAdd}
          onCancel={() => {
            setActiveModal(null);
            setBulkTagInput([]);
          }}
        />
      )}

      {/* 共有設定モーダル */}
      <BulkVisibilityModal
        isOpen={activeModal === "visibility"}
        selectedCount={selectedIds.length}
        privateCount={selectedPrivateCount}
        sharedCount={selectedSharedCount}
        unshareableCount={unshareableRecords.length}
        excludedUnshareRecords={excludedUnshareRecords}
        onShare={handleBulkShare}
        onUnshare={handleBulkUnshare}
        onClose={() => setActiveModal(null)}
      />

      {/* 管理者一括設定モーダル */}
      <BulkAdminModal
        isOpen={activeModal === "admin"}
        selectedRecords={selectedRecords}
        familyMembers={family?.users || []}
        activeAccountId={activeAccountId}
        onClose={() => setActiveModal(null)}
        onSuccess={async () => {
          setActiveModal(null);
          setSelectedIds([]);
          setIsSelectMode(false);
        }}
      />

      {/* 削除確認モーダル */}
      {activeModal === "delete" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-red-500 mb-2">
              レコードの一括削除
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              選択した {selectedIds.length} 件のレコードを削除しますか？
              <br />
              この操作は取り消すことができません。
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-full sm:w-auto rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition cursor-pointer text-center"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                className="w-full sm:w-auto rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition cursor-pointer text-center"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// サンプルデータ表示中バナー（レコード一覧のisSampleをチェック）
function RecordListBannerSection({
  onRestart,
  onPurge,
  isPurging,
}: {
  onRestart: () => void;
  onPurge: () => void;
  isPurging: boolean;
}) {
  const { activeAccountId } = useAccount();
  const records = usePersistentQuery<RecordType[]>(api.records.getRecords, {
    accountId: activeAccountId || undefined,
  });

  const hasSamples = useMemo(
    () =>
      records?.some(
        (r) => (r as RecordType & { isSample?: boolean }).isSample,
      ) ?? false,
    [records],
  );

  if (!hasSamples) return null;

  return (
    <OnboardingBanner
      isPurging={isPurging}
      onRestartTour={onRestart}
      onPurge={onPurge}
    />
  );
}

// 一括タグ追加モーダルコンポーネント
function BulkTagModal({
  bulkTagInput,
  setBulkTagInput,
  onSubmit,
  onCancel,
}: {
  bulkTagInput: string[];
  setBulkTagInput: (tags: string[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { activeAccountId } = useAccount();
  const availableTags =
    usePersistentQuery<string[]>(api.records.getAvailableTags, {
      accountId: activeAccountId || undefined,
    }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg animate-in fade-in duration-200">
        <h3 className="text-lg font-semibold mb-2">
          選択したレコードにタグを追加
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          追加したいタグを入力してください。既存のタグにマージされます。
        </p>
        <div className="mb-6">
          <TagInput
            value={bulkTagInput}
            onChange={setBulkTagInput}
            availableTags={availableTags}
            placeholder="タグを入力 (Enterで確定)..."
          />
        </div>
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition cursor-pointer text-center"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="w-full sm:w-auto rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition cursor-pointer text-center"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}

// レコード一覧コンポーネント
function RecordListSection({
  searchParams,
  sortParam,
  viewMode,
  handleTagClick,
  handleSortChange,
  handleViewModeChange,
  isSelectMode,
  setIsSelectMode,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}: {
  searchParams: z.infer<typeof searchSchema>;
  sortParam: SortParam;
  viewMode: "card" | "list";
  handleTagClick: (tag: string) => void;
  handleSortChange: (newSort: SortParam) => void;
  handleViewModeChange: (newMode: "card" | "list") => void;
  isSelectMode: boolean;
  setIsSelectMode: (mode: boolean) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
}) {
  const { activeAccountId } = useAccount();
  const records = usePersistentQuery<RecordType[]>(api.records.getRecords, {
    accountId: activeAccountId || undefined,
    q: searchParams.q,
    tag: searchParams.tag,
    sort: sortParam,
  });

  const firstSampleRecordId = useMemo(
    () =>
      records?.find((r) => (r as RecordType & { isSample?: boolean }).isSample)
        ?._id,
    [records],
  );

  const groupedRecords = useMemo(() => {
    return groupRecordsByIndex(records || []);
  }, [records]);

  const availableGroups = useMemo(() => {
    return groupedRecords.map((g) => g.groupKey);
  }, [groupedRecords]);

  if (records === undefined) {
    return <RecordListSkeleton />;
  }

  return (
    <>
      {records.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isSelectMode ? (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={
                    records.length > 0 && selectedIds.length === records.length
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelectAll(records.map((r) => r._id));
                    } else {
                      onSelectAll([]);
                    }
                  }}
                  className="rounded border-border text-orange-500 focus:ring-orange-500 h-4 w-4 cursor-pointer"
                />
                <span className="text-[13px] font-medium text-muted-foreground">
                  すべて選択
                </span>
              </label>
            ) : (
              <div
                className="text-[14px] text-muted-foreground font-medium tracking-geist-ui"
                data-testid="record-count"
              >
                {records.length} 件のレコード
              </div>
            )}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                onSelectAll([]);
                setIsSelectMode(!isSelectMode);
              }}
              className={`rounded-md border px-3 py-1.5 h-8 text-[12px] font-medium transition cursor-pointer flex items-center justify-center shrink-0 ${
                isSelectMode
                  ? "bg-orange-500 border-orange-500 text-white hover:bg-orange-600 shadow-sm"
                  : "bg-card border-border/50 text-foreground hover:bg-accent"
              }`}
            >
              {isSelectMode ? "選択終了" : "一括操作"}
            </button>
            <select
              value={
                sortParam === "updatedAt-desc"
                  ? "date-desc"
                  : sortParam === "updatedAt-asc"
                    ? "date-asc"
                    : sortParam
              }
              onChange={(e) => handleSortChange(e.target.value as SortParam)}
              className="rounded-md border border-border/50 bg-card px-2 py-1.5 h-8 text-[12px] font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            >
              <option value="name-asc">名前（昇順）</option>
              <option value="url-asc">URL（昇順）</option>
              <option value="url-desc">URL（降順）</option>
              <option value="date-desc">最終更新日（降順）</option>
              <option value="date-asc">最終更新日（昇順）</option>
            </select>
            <div className="flex items-center rounded-md border border-border/50 bg-card shadow-sm h-8 overflow-hidden">
              <button
                type="button"
                onClick={() => handleViewModeChange("card")}
                className={`p-1.5 transition-colors ${viewMode === "card" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                title="カード表示"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange("list")}
                className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                title="リスト表示"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="rounded-lg bg-muted/50 p-12 text-center text-muted-foreground shadow-border">
          まだ登録されたサービスはありません。
          <br />
          右上のボタンから追加してみましょう！
        </div>
      ) : sortParam === "name-asc" ? (
        <>
          <IndexScrollBar
            availableGroups={availableGroups}
            className="mt-9 md:mt-4"
          />
          <div className="space-y-6">
            {groupedRecords.map(({ groupKey, items }) => (
              <div
                key={groupKey}
                id={`index-group-${groupKey}`}
                className="scroll-mt-16"
              >
                <div className="sticky top-14 z-10 bg-background/90 backdrop-blur py-1.5 px-3 mb-3 border-b border-border/40 text-xs font-bold text-orange-500 tracking-wider flex items-center gap-2 rounded-md">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/10 text-orange-500 text-[11px]">
                    {groupKey}
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground ml-auto">
                    {items.length}件
                  </span>
                </div>
                <div
                  className={
                    viewMode === "card"
                      ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
                      : "flex flex-col gap-3"
                  }
                >
                  {items.map((record) =>
                    viewMode === "card" ? (
                      <ServiceCard
                        key={record._id}
                        record={record}
                        onTagClick={handleTagClick}
                        isSelectMode={isSelectMode}
                        isSelected={selectedIds.includes(record._id)}
                        onToggleSelect={() => onToggleSelect(record._id)}
                        dataTour={
                          record._id === firstSampleRecordId
                            ? "sample-record"
                            : undefined
                        }
                      />
                    ) : (
                      <ServiceListItem
                        key={record._id}
                        record={record}
                        onTagClick={handleTagClick}
                        isSelectMode={isSelectMode}
                        isSelected={selectedIds.includes(record._id)}
                        onToggleSelect={() => onToggleSelect(record._id)}
                        dataTour={
                          record._id === firstSampleRecordId
                            ? "sample-record"
                            : undefined
                        }
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div
          className={
            viewMode === "card"
              ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
              : "flex flex-col gap-3"
          }
        >
          {records.map((record) =>
            viewMode === "card" ? (
              <ServiceCard
                key={record._id}
                record={record}
                onTagClick={handleTagClick}
                isSelectMode={isSelectMode}
                isSelected={selectedIds.includes(record._id)}
                onToggleSelect={() => onToggleSelect(record._id)}
                dataTour={
                  record._id === firstSampleRecordId
                    ? "sample-record"
                    : undefined
                }
              />
            ) : (
              <ServiceListItem
                key={record._id}
                record={record}
                onTagClick={handleTagClick}
                isSelectMode={isSelectMode}
                isSelected={selectedIds.includes(record._id)}
                onToggleSelect={() => onToggleSelect(record._id)}
                dataTour={
                  record._id === firstSampleRecordId
                    ? "sample-record"
                    : undefined
                }
              />
            ),
          )}
        </div>
      )}
    </>
  );
}

type RecordType = NonNullable<
  (typeof api.records.getRecords)["_returnType"]
>[number];

// リスト表示用コンポーネント
function ServiceListItem({
  record,
  onTagClick,
  isSelectMode,
  isSelected,
  onToggleSelect,
  dataTour,
}: {
  record: RecordType;
  onTagClick: (tag: string) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  dataTour?: string;
}) {
  const isShared = record.ownerType === "family";
  return (
    <Link
      to="/records/$id"
      params={{ id: record._id }}
      {...(dataTour ? { "data-tour": dataTour } : {})}
      onClick={(e) => {
        if (isSelectMode && onToggleSelect) {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect();
        }
      }}
      className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-hidden rounded-lg bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover border block ${
        isSelected
          ? "border-orange-500 ring-2 ring-orange-500/20"
          : "border-border/50"
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden flex-1 w-full min-w-0">
        {isSelectMode && onToggleSelect && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect();
            }}
            className="flex items-center justify-center shrink-0 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={isSelected}
              readOnly
              className="rounded border-border text-orange-500 focus:ring-orange-500 h-4 w-4 cursor-pointer"
            />
          </button>
        )}
        <div className="flex flex-col gap-1 overflow-hidden flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold text-foreground truncate tracking-geist-ui group-hover:text-orange-500 transition-colors">
              {record.title}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isShared
                  ? "bg-blue-100/50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {isShared ? "共有中" : "自分のみ"}
            </span>
          </div>
          {record.url && (
            <span className="text-[12px] text-muted-foreground truncate">
              {record.url}
            </span>
          )}
          {(() => {
            const loginIds = record.credentials
              .map((c) => c.loginId)
              .filter(Boolean);
            if (loginIds.length === 0) return null;
            return (
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-[12px] font-mono text-muted-foreground truncate">
                  {loginIds[0]}
                </span>
                {loginIds.length > 1 && (
                  <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    +{loginIds.length - 1} ID(s)
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {record.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 shrink-0 sm:justify-end mt-2 sm:mt-0">
          {record.tags.map((t) => (
            <button
              type="button"
              key={t}
              onClick={(e) => {
                e.preventDefault();
                onTagClick(t);
              }}
              className="rounded-full bg-background border border-border/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-colors relative z-10 cursor-pointer"
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </Link>
  );
}

// カードコンポーネント (UIパーツ)
function ServiceCard({
  record,
  onTagClick,
  isSelectMode,
  isSelected,
  onToggleSelect,
  dataTour,
}: {
  record: RecordType;
  onTagClick: (tag: string) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  dataTour?: string;
}) {
  return (
    <Link
      to="/records/$id"
      params={{ id: record._id }}
      onClick={(e) => {
        if (isSelectMode && onToggleSelect) {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect();
        }
      }}
      {...(dataTour ? { "data-tour": dataTour } : {})}
      className={`group relative flex flex-row md:flex-col overflow-hidden rounded-lg bg-card shadow-card transition-shadow hover:shadow-card-hover block border ${
        isSelected
          ? "border-orange-500 ring-2 ring-orange-500/20"
          : "border-border/50"
      }`}
    >
      {/* 選択チェックボックス */}
      {isSelectMode && onToggleSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect();
          }}
          className="absolute top-3 left-3 z-10 flex items-center justify-center rounded bg-card p-1.5 border border-border shadow-sm cursor-pointer"
        >
          <input
            type="checkbox"
            checked={isSelected}
            readOnly
            className="rounded border-border text-orange-500 focus:ring-orange-500 h-4 w-4 cursor-pointer"
          />
        </button>
      )}

      {/* OGP画像エリア */}
      <div className="block aspect-square w-28 shrink-0 md:aspect-video md:w-full bg-muted object-cover overflow-hidden">
        {record.ogpImage ? (
          <img
            src={record.ogpImage}
            alt={record.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/30 text-2xl md:text-4xl font-bold bg-muted transition-transform duration-300 group-hover:scale-105">
            {record.title.slice(0, 1)}
          </div>
        )}
      </div>

      {/* コンテンツエリア */}
      <div className="flex flex-1 flex-col justify-center p-3 md:p-4 overflow-hidden">
        <div className="mb-1 md:mb-2 flex items-start justify-between gap-2">
          <span className="text-[16px] md:text-[18px] font-semibold text-foreground line-clamp-2 md:line-clamp-1 tracking-geist-ui group-hover:text-orange-500 transition-colors">
            {record.title}
          </span>
          {/* 所有設定バッジ */}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] md:text-xs font-medium ${
              record.ownerType === "family"
                ? "bg-blue-100/50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {record.ownerType === "family" ? "共有中" : "自分のみ"}
          </span>
        </div>

        {/* ログインID表示 */}
        {(() => {
          const loginIds = record.credentials
            .map((c) => c.loginId)
            .filter(Boolean);
          if (loginIds.length === 0) return null;
          return (
            <div className="mb-1 md:mb-2 flex items-center gap-1.5 overflow-hidden">
              <span className="text-[11px] md:text-[12px] font-mono text-muted-foreground truncate">
                {loginIds[0]}
              </span>
              {loginIds.length > 1 && (
                <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  +{loginIds.length - 1} ID(s)
                </span>
              )}
            </div>
          );
        })()}

        {/* タグ表示 */}
        <div className="mb-0 md:mb-4 flex flex-wrap gap-1">
          {record.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTagClick(tag);
              }}
              className="relative z-10 cursor-pointer rounded-full bg-secondary px-2 py-0.5 text-[10px] md:text-[12px] text-muted-foreground hover:bg-accent transition"
            >
              #{tag}
            </button>
          ))}
        </div>

        {/* 詳細リンク (モバイルでは高さを節約するため非表示) */}
        <span className="mt-auto hidden w-full rounded-md bg-card py-1.5 text-center text-[14px] font-medium text-foreground shadow-border transition group-hover:bg-accent md:block">
          詳細を見る
        </span>
      </div>
    </Link>
  );
}
