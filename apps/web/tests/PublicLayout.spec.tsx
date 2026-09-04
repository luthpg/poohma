// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLayout } from "@/components/PublicLayout";

// Mock TanStack Router
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
		[key: string]: unknown;
	}) => (
		<a href={to} className={className} {...props}>
			{children}
		</a>
	),
	useLocation: () => ({ pathname: "/" }),
	useRouter: () => ({ invalidate: vi.fn() }),
}));

// Mock UserMenu to avoid complex internal dependencies (Firebase, Convex)
vi.mock("@/components/user-menu", () => ({
	UserMenu: ({ user }: { user: { displayName?: string } }) => (
		<div data-testid="mock-user-menu">UserMenu: {user.displayName}</div>
	),
}));

describe("PublicLayout Component", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("未ログイン時はログインボタンが表示され、UserMenuが表示されないこと", () => {
		render(
			<PublicLayout user={null}>
				<div>Content</div>
			</PublicLayout>,
		);

		expect(screen.queryByTestId("mock-user-menu")).toBeNull();
		const loginLinks = screen.getAllByRole("link", { name: "ログイン" });
		expect(loginLinks.length).toBeGreaterThan(0);
	});

	it("ログイン時はUserMenuが表示されること", () => {
		render(
			<PublicLayout
				user={{
					displayName: "テストユーザー",
					email: "test@example.com",
					photoURL: null,
				}}
			>
				<div>Content</div>
			</PublicLayout>,
		);

		const userMenus = screen.getAllByTestId("mock-user-menu");
		expect(userMenus.length).toBeGreaterThan(0);
		expect(userMenus[0].textContent).toContain("テストユーザー");

		// ログイン時はハンバーガーメニューが非表示になること
		expect(screen.queryByRole("button", { name: "メニューを開く" })).toBeNull();
	});
});
