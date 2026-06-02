// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import * as convexReact from "convex/react";
import type React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import * as passcodeProvider from "@/components/PasscodeProvider";
import { Route } from "@/routes/(app)/records/new";

// Mock tanstack router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: vi.fn(),
    createFileRoute: vi.fn(
      () => (config: { component: React.ComponentType }) => config.component,
    ),
  };
});

// Mock react-query
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

// Mock Convex React hooks
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
  useConvexAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
}));

// Mock PasscodeProvider hook
vi.mock("@/components/PasscodeProvider", () => ({
  usePasscode: vi.fn(),
}));

const NewRecordComponent = Route as unknown as React.ComponentType;

describe("records/new Component", () => {
  const mockCreateRecord = vi.fn();
  let mockGetOgpInfo: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    (passcodeProvider.usePasscode as Mock).mockReturnValue({
      encryptHint: vi.fn(),
      masterKey: {}, // mocked key
      requireUnlock: vi.fn(),
    });

    (convexReact.useQuery as Mock).mockReturnValue(["tag1", "tag2"]);
    (convexReact.useMutation as Mock).mockReturnValue(mockCreateRecord);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("should asynchronously fetch OGP info and reflect it on the form upon URL blur", async () => {
    let resolveOgp: ((value: unknown) => void) | null = null;
    const ogpPromise = new Promise((resolve) => {
      resolveOgp = resolve;
    });

    mockGetOgpInfo = vi.fn().mockReturnValue(ogpPromise);
    (convexReact.useAction as Mock).mockReturnValue(mockGetOgpInfo);

    render(<NewRecordComponent />);

    const urlInput = screen.getByLabelText("URL");
    const titleInput = screen.getByLabelText(/サービス名/);

    expect((titleInput as HTMLInputElement).value).toBe("");

    fireEvent.change(urlInput, { target: { value: "https://example.com" } });
    fireEvent.blur(urlInput);

    expect(screen.getByText("情報取得中...")).toBeTruthy();
    expect(mockGetOgpInfo).toHaveBeenCalledWith({
      url: "https://example.com",
    });

    (resolveOgp as unknown as (value: unknown) => void)?.({
      title: "Example Domain",
      image: "https://example.com/ogp.png",
      description: "This is an example domain.",
    });

    await waitFor(() => {
      expect(screen.queryByText("情報取得中...")).toBeNull();
      expect((titleInput as HTMLInputElement).value).toBe("Example Domain");
    });
  });
});
