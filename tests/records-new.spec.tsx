// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
import * as recordsFunctions from "@/services/records.functions";

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

// Mock services
vi.mock("@/services/records.functions", () => ({
  createRecord: vi.fn(),
  getAvailableTagsFn: vi.fn(),
  getOgpInfoFn: vi.fn(),
}));

// Mock PasscodeProvider hook
vi.mock("@/components/PasscodeProvider", () => ({
  usePasscode: vi.fn(),
}));

// Expose the component directly from the mocked route creation
// Route is basically the component because we mocked createFileRoute
const NewRecordComponent = Route as unknown as React.ComponentType;

describe("records/new Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    (passcodeProvider.usePasscode as Mock).mockReturnValue({
      encryptHint: vi.fn(),
      masterKey: {}, // mocked key
      requireUnlock: vi.fn(),
    });

    // Mock Route.useLoaderData if it exists on the mocked Route object
    (Route as unknown as Record<string, unknown>).useLoaderData = vi
      .fn()
      .mockReturnValue(["tag1", "tag2"]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("should asynchronously fetch OGP info and reflect it on the form upon URL blur", async () => {
    // Setup delayed promise for getOgpInfoFn to test loading state
    let resolveOgp: ((value: unknown) => void) | null = null;
    const ogpPromise = new Promise((resolve) => {
      resolveOgp = resolve;
    });

    (recordsFunctions.getOgpInfoFn as unknown as Mock).mockReturnValue(
      ogpPromise,
    );

    render(<NewRecordComponent />);

    const urlInput = screen.getByLabelText("URL");
    const titleInput = screen.getByLabelText(/サービス名/);

    // Initial state
    expect((titleInput as HTMLInputElement).value).toBe("");

    // Input URL and trigger blur
    fireEvent.change(urlInput, { target: { value: "https://example.com" } });
    fireEvent.blur(urlInput);

    // Verify loading spinner is shown
    expect(screen.getByText("情報取得中...")).toBeTruthy();
    expect(recordsFunctions.getOgpInfoFn).toHaveBeenCalledWith({
      data: { url: "https://example.com" },
    });

    // Resolve OGP mock with dummy data
    (resolveOgp as unknown as (value: unknown) => void)?.({
      title: "Example Domain",
      image: "https://example.com/ogp.png",
      description: "This is an example domain.",
    });

    // Wait for the form to update and spinner to disappear
    await waitFor(() => {
      expect(screen.queryByText("情報取得中...")).toBeNull();
      expect((titleInput as HTMLInputElement).value).toBe("Example Domain");
    });
  });
});
