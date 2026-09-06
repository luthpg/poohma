import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { onAuthStateChanged } from "firebase/auth";
import { CheckCircle2, Send } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/../convex/_generated/api";
import { CONTACT_CATEGORIES } from "@/../convex/contacts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { auth } from "@/utils/firebase";

export const Route = createFileRoute("/(public)/contact")({
	component: ContactPage,
});

const CATEGORIES = CONTACT_CATEGORIES;

const contactFormSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "お名前を入力してください")
		.max(100, "お名前は100文字以内で入力してください"),
	email: z
		.string()
		.trim()
		.min(1, "メールアドレスを入力してください")
		.email("有効なメールアドレスを入力してください"),
	category: z
		.string()
		.refine(
			(val): val is (typeof CONTACT_CATEGORIES)[number] =>
				CONTACT_CATEGORIES.includes(val as (typeof CONTACT_CATEGORIES)[number]),
			{ message: "お問い合わせ種別を選択してください" },
		),
	message: z
		.string()
		.trim()
		.min(5, "メッセージは5文字以上で入力してください")
		.max(3000, "メッセージは3000文字以内で入力してください"),
});

function ContactPage() {
	const createContactMut = useMutation(api.contacts.createContact);

	const [userId, setUserId] = useState<string | undefined>(
		auth?.currentUser?.uid,
	);
	const [name, setName] = useState(auth?.currentUser?.displayName || "");
	const [email, setEmail] = useState(auth?.currentUser?.email || "");
	const [category, setCategory] = useState<string>(CATEGORIES[0]);
	const [message, setMessage] = useState("");
	const [hpConfirm, setHpConfirm] = useState(""); // Honeypot
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);

	// Firebase Auth の非同期復元完了時にフォーム情報を自動補完
	useEffect(() => {
		if (!auth) return;
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			if (user) {
				setUserId(user.uid);
				setName((prev) => (prev ? prev : user.displayName || ""));
				setEmail((prev) => (prev ? prev : user.email || ""));
			}
		});
		return () => unsubscribe();
	}, []);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setErrors({});

		const result = contactFormSchema.safeParse({
			name,
			email,
			category,
			message,
		});

		if (!result.success) {
			const formattedErrors: Record<string, string> = {};
			for (const issue of result.error.issues) {
				const field = issue.path[0] as string;
				if (!formattedErrors[field]) {
					formattedErrors[field] = issue.message;
				}
			}
			setErrors(formattedErrors);
			return;
		}

		setIsSubmitting(true);
		try {
			await createContactMut({
				name: result.data.name,
				email: result.data.email,
				category: result.data.category,
				message: result.data.message,
				hpConfirm: hpConfirm || undefined,
			});

			setIsSuccess(true);
			toast.success("お問い合わせを送信しました");
		} catch (error) {
			console.error("Failed to send contact:", error);
			const errorMessage =
				error instanceof ConvexError && typeof error.data === "string"
					? error.data
					: "お問い合わせの送信に失敗しました。時間をおいて再度お試しください。";
			toast.error(errorMessage);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleReset = () => {
		setMessage("");
		setErrors({});
		setIsSuccess(false);
	};

	return (
		<div className="container mx-auto my-12 max-w-2xl px-4 sm:px-6">
			{/* ヘッドライン */}
			<div className="mb-10">
				<h1 className="mb-2 text-[32px] sm:text-[40px] font-semibold tracking-[-2px] sm:tracking-[-2.4px] text-foreground">
					お問い合わせ
				</h1>
				<p className="text-[15px] sm:text-[16px] text-muted-foreground">
					PoohMaに関するご質問、ご要望、不具合の報告などはこちらのフォームよりお気軽にお問い合わせください。
				</p>
			</div>

			{isSuccess ? (
				<div className="rounded-2xl border border-border/60 bg-card p-8 sm:p-12 text-center shadow-xs animate-in fade-in zoom-in-95 duration-200">
					<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
						<CheckCircle2 className="h-8 w-8" />
					</div>
					<h2 className="text-[20px] sm:text-[22px] font-bold text-foreground mb-2">
						お問い合わせを受け付けました
					</h2>
					<p className="text-[14px] text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
						送信いただきありがとうございます。内容を確認の上、必要に応じて担当者よりご入力いただいたメールアドレス宛にご連絡いたします。
					</p>
					<div className="flex flex-col sm:flex-row items-center justify-center gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={handleReset}
							className="w-full sm:w-auto"
						>
							続けて別のお問い合わせを送信する
						</Button>
						<Button asChild className="w-full sm:w-auto">
							<Link to={userId ? "/dashboard" : "/"}>
								{userId ? "ダッシュボードへ戻る" : "トップページへ戻る"}
							</Link>
						</Button>
					</div>
				</div>
			) : (
				<form
					onSubmit={handleSubmit}
					className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8 shadow-xs space-y-6"
				>
					{/* Honeypot スパム防御フィールド (人間には非表示) */}
					<div className="sr-only" aria-hidden="true">
						<label htmlFor="hp-confirm">Confirm</label>
						<input
							id="hp-confirm"
							type="text"
							name="hp_confirm"
							tabIndex={-1}
							autoComplete="off"
							value={hpConfirm}
							onChange={(e) => setHpConfirm(e.target.value)}
						/>
					</div>

					{/* お名前 */}
					<div className="space-y-2">
						<label
							htmlFor="contact-name"
							className="block text-[14px] font-semibold text-foreground"
						>
							お名前 <span className="text-destructive">*</span>
						</label>
						<input
							id="contact-name"
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="山田 太郎"
							disabled={isSubmitting}
							className={`h-11 w-full rounded-lg border bg-background px-3.5 text-base md:text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-ring/20 transition-colors ${
								errors.name
									? "border-destructive focus:border-destructive"
									: "border-border focus:border-foreground/30"
							}`}
						/>
						{errors.name && (
							<p className="text-[12px] font-medium text-destructive">
								{errors.name}
							</p>
						)}
					</div>

					{/* メールアドレス */}
					<div className="space-y-2">
						<label
							htmlFor="contact-email"
							className="block text-[14px] font-semibold text-foreground"
						>
							メールアドレス <span className="text-destructive">*</span>
						</label>
						<input
							id="contact-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="example@poohma.app"
							disabled={isSubmitting}
							className={`h-11 w-full rounded-lg border bg-background px-3.5 text-base md:text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-ring/20 transition-colors ${
								errors.email
									? "border-destructive focus:border-destructive"
									: "border-border focus:border-foreground/30"
							}`}
						/>
						{errors.email && (
							<p className="text-[12px] font-medium text-destructive">
								{errors.email}
							</p>
						)}
					</div>

					{/* お問い合わせ種別 */}
					<div className="space-y-2">
						<label
							htmlFor="contact-category"
							className="block text-[14px] font-semibold text-foreground"
						>
							お問い合わせ種別 <span className="text-destructive">*</span>
						</label>
						<select
							id="contact-category"
							value={category}
							onChange={(e) => setCategory(e.target.value)}
							disabled={isSubmitting}
							className="h-11 w-full rounded-lg border border-border bg-background px-3.5 text-base md:text-[14px] text-foreground focus:border-foreground/30 focus:outline-hidden focus:ring-2 focus:ring-ring/20 transition-colors"
						>
							{CATEGORIES.map((cat) => (
								<option key={cat} value={cat}>
									{cat}
								</option>
							))}
						</select>
					</div>

					{/* メッセージ本文 */}
					<div className="space-y-2">
						<label
							htmlFor="contact-message"
							className="block text-[14px] font-semibold text-foreground"
						>
							お問い合わせ内容 <span className="text-destructive">*</span>
						</label>
						<textarea
							id="contact-message"
							rows={6}
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder="お問い合わせ内容をできるだけ詳しくご記入ください..."
							disabled={isSubmitting}
							className={`w-full rounded-lg border bg-background p-3.5 text-base md:text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-ring/20 transition-colors resize-y ${
								errors.message
									? "border-destructive focus:border-destructive"
									: "border-border focus:border-foreground/30"
							}`}
						/>
						{errors.message && (
							<p className="text-[12px] font-medium text-destructive">
								{errors.message}
							</p>
						)}
						<p className="text-right text-[11px] text-muted-foreground">
							{message.length} / 3000 文字
						</p>
					</div>

					{/* 送信ボタン */}
					<div className="pt-2">
						<Button
							type="submit"
							disabled={isSubmitting}
							className="w-full h-11 text-[15px] font-medium shadow-xs"
						>
							{isSubmitting ? (
								<>
									<Spinner className="mr-2 h-4 w-4" />
									送信中...
								</>
							) : (
								<>
									<Send className="mr-2 h-4 w-4" />
									送信する
								</>
							)}
						</Button>
					</div>
				</form>
			)}
		</div>
	);
}

export default ContactPage;
