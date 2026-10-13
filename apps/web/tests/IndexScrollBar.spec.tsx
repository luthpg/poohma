// @vitest-environment jsdom

import type { IndexGroupKey } from "@poohma/shared/utils/index-group";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexScrollBar } from "@/components/IndexScrollBar";

describe("IndexScrollBar Component", () => {
  const groups: IndexGroupKey[] = ["あ", "か", "さ", "た", "な"];

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom の scroll, innerHeight, scrollHeight 設定
    window.innerHeight = 800;
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 3000,
      configurable: true,
      writable: true,
    });
    window.scrollTo = vi.fn();
    window.scrollY = 0;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("availableGroups が空配列の場合は何もレンダリングされないこと", () => {
    const { container } = render(<IndexScrollBar availableGroups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("指定したグループボタンと末尾スクロールボタンが正しく描画されること", () => {
    render(<IndexScrollBar availableGroups={groups} />);

    for (const key of groups) {
      expect(screen.getByRole("button", { name: key })).toBeTruthy();
    }
    expect(
      screen.getByRole("button", { name: "末尾までスクロール" }),
    ).toBeTruthy();
  });

  it("ボタンをクリックした際、onSelectGroup コールバックが渡されていればそれが呼ばれること", () => {
    const onSelectGroup = vi.fn();
    render(
      <IndexScrollBar availableGroups={groups} onSelectGroup={onSelectGroup} />,
    );

    const button = screen.getByRole("button", { name: "あ" });
    fireEvent.click(button);

    expect(onSelectGroup).toHaveBeenCalledWith("あ");
  });

  it("ボタンをクリックした際、該当要素へのネイティブ smooth スクロールが実行されること", () => {
    const dummyEl = document.createElement("div");
    dummyEl.id = "index-group-か";
    dummyEl.getBoundingClientRect = vi.fn(() => ({
      top: 500,
      bottom: 550,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 500,
      toJSON: () => {},
    }));
    document.body.appendChild(dummyEl);

    render(<IndexScrollBar availableGroups={groups} />);

    const button = screen.getByRole("button", { name: "か" });
    fireEvent.click(button);

    // 500 + window.scrollY(0) - 60 = 440
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 440,
      behavior: "smooth",
    });

    document.body.removeChild(dummyEl);
  });

  it("末尾スクロールボタンをクリックした際、ページの末尾へネイティブ smooth スクロールされること", () => {
    render(<IndexScrollBar availableGroups={groups} />);

    const bottomButton = screen.getByRole("button", {
      name: "末尾までスクロール",
    });
    fireEvent.click(bottomButton);

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 3000,
      behavior: "smooth",
    });
  });

  it("touchstart だけの単発タップでは自前 rAF スクロールが先行発火しないこと", () => {
    render(<IndexScrollBar availableGroups={groups} />);

    const button = screen.getByRole("button", { name: "さ" });
    const container = button.closest("div[class*='fixed']") as HTMLElement;

    // container の getBoundingClientRect モック
    container.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 500,
      left: 300,
      right: 340,
      width: 40,
      height: 400,
      x: 300,
      y: 100,
      toJSON: () => {},
    }));

    // touchstart 発火（単発タップ開始）
    fireEvent.touchStart(container, {
      touches: [{ clientX: 320, clientY: 250 }],
    });

    // touchstart だけでは window.scrollTo（自前アニメーション）は開始されない
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("PCでのマウス単体クリック時に setPointerCapture が呼ばれず、ボタンの onClick によるスクロールが成立すること", () => {
    const dummyEl = document.createElement("div");
    dummyEl.id = "index-group-さ";
    dummyEl.getBoundingClientRect = vi.fn(() => ({
      top: 800,
      bottom: 850,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 800,
      toJSON: () => {},
    }));
    document.body.appendChild(dummyEl);

    render(<IndexScrollBar availableGroups={groups} />);

    const button = screen.getByRole("button", { name: "さ" });
    const container = button.closest("div[class*='fixed']") as HTMLElement;

    container.setPointerCapture = vi.fn();

    // pointerdown (マウス押下)
    fireEvent.pointerDown(container, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 320,
      clientY: 250,
    });
    // 単体クリックでは pointerdown 時点で setPointerCapture が呼ばれてはならない
    expect(container.setPointerCapture).not.toHaveBeenCalled();

    // pointerup (マウス解放)
    fireEvent.pointerUp(container, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 320,
      clientY: 250,
    });

    // click (ブラウザが子ボタンへ click をディスパッチ)
    fireEvent.click(button);

    // 800 + window.scrollY(0) - 60 = 740
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 740,
      behavior: "smooth",
    });

    document.body.removeChild(dummyEl);
  });

  it("PCでボタン外の余白をクリックした場合（handleContainerClick）でも該当グループへスクロールされること", () => {
    const dummyEl = document.createElement("div");
    dummyEl.id = "index-group-か";
    dummyEl.getBoundingClientRect = vi.fn(() => ({
      top: 600,
      bottom: 650,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 600,
      toJSON: () => {},
    }));
    document.body.appendChild(dummyEl);

    render(<IndexScrollBar availableGroups={groups} />);

    const container = document.querySelector(
      "div[class*='fixed']",
    ) as HTMLElement;
    container.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 700,
      left: 300,
      right: 340,
      width: 40,
      height: 600,
      x: 300,
      y: 100,
      toJSON: () => {},
    }));

    // 余白（親 div 自体）をクリック（pointerdown -> pointerup）
    // clientY = 220: relativeY = (220-100)/600 = 0.2
    // 0.2 * 6 = 1.2 -> index 1 -> "か"
    fireEvent.pointerDown(container, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 320,
      clientY: 220,
    });
    fireEvent.pointerUp(container, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 320,
      clientY: 220,
    });

    // 600 + 0 - 60 = 540
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 540,
      behavior: "smooth",
    });

    document.body.removeChild(dummyEl);
  });

  it("PCでマウスドラッグ（4px以上移動）した際には setPointerCapture が呼ばれて追従スクロールが動くこと", () => {
    vi.useFakeTimers();

    const dummyEl = document.createElement("div");
    dummyEl.id = "index-group-た";
    dummyEl.getBoundingClientRect = vi.fn(() => ({
      top: 1000,
      bottom: 1050,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 1000,
      toJSON: () => {},
    }));
    document.body.appendChild(dummyEl);

    render(<IndexScrollBar availableGroups={groups} />);

    const container = document.querySelector(
      "div[class*='fixed']",
    ) as HTMLElement;
    container.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 700,
      left: 300,
      right: 340,
      width: 40,
      height: 600,
      x: 300,
      y: 100,
      toJSON: () => {},
    }));

    container.setPointerCapture = vi.fn();

    // pointerdown
    fireEvent.pointerDown(container, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 320,
      clientY: 120,
    });
    expect(container.setPointerCapture).not.toHaveBeenCalled();

    // 微小移動 (2px)
    fireEvent.pointerMove(container, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 320,
      clientY: 122,
    });
    expect(container.setPointerCapture).not.toHaveBeenCalled();

    // 4px 超移動 -> ドラッグ確定
    fireEvent.pointerMove(container, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 320,
      clientY: 130,
    });
    expect(container.setPointerCapture).toHaveBeenCalledWith(1);

    document.body.removeChild(dummyEl);
    vi.useRealTimers();
  });

  it("タッチ移動（ドラッグ）が一定閾値（6px）を超えた場合にドラッグ追従スクロールが開始されること", () => {
    vi.useFakeTimers();

    const dummyEl = document.createElement("div");
    dummyEl.id = "index-group-あ";
    dummyEl.getBoundingClientRect = vi.fn(() => ({
      top: 200,
      bottom: 250,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 200,
      toJSON: () => {},
    }));
    document.body.appendChild(dummyEl);

    render(<IndexScrollBar availableGroups={groups} />);

    const button = screen.getByRole("button", { name: "あ" });
    const container = button.closest("div[class*='fixed']") as HTMLElement;

    container.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 700,
      left: 300,
      right: 340,
      width: 40,
      height: 600,
      x: 300,
      y: 100,
      toJSON: () => {},
    }));

    // touchstart
    fireEvent.touchStart(container, {
      touches: [{ clientX: 320, clientY: 120 }],
    });
    expect(window.scrollTo).not.toHaveBeenCalled();

    // 微小な移動（2px）-> ドラッグと判定されない
    fireEvent.touchMove(container, {
      touches: [{ clientX: 320, clientY: 122 }],
    });
    expect(window.scrollTo).not.toHaveBeenCalled();

    // 6px 超の移動 -> ドラッグ判定となり、スクロール追従が開始される
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    fireEvent.touchMove(container, {
      touches: [{ clientX: 320, clientY: 130 }],
    });

    expect(rafSpy).toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(window.scrollTo).toHaveBeenCalled();

    document.body.removeChild(dummyEl);
    vi.useRealTimers();
  });

  it("外部操作（ホイール・touchmove）が発生した際に自前アニメーションが即座にキャンセルされること", () => {
    vi.useFakeTimers();

    const dummyEl = document.createElement("div");
    dummyEl.id = "index-group-た";
    dummyEl.getBoundingClientRect = vi.fn(() => ({
      top: 1000,
      bottom: 1050,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 1000,
      toJSON: () => {},
    }));
    document.body.appendChild(dummyEl);

    render(<IndexScrollBar availableGroups={groups} />);

    const button = screen.getByRole("button", { name: "た" });
    const container = button.closest("div[class*='fixed']") as HTMLElement;

    container.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 700,
      left: 300,
      right: 340,
      width: 40,
      height: 600,
      x: 300,
      y: 100,
      toJSON: () => {},
    }));

    // ドラッグを開始して rAF アニメーションを動かす
    fireEvent.touchStart(container, {
      touches: [{ clientX: 320, clientY: 120 }],
    });
    fireEvent.touchMove(container, {
      touches: [{ clientX: 320, clientY: 400 }],
    });
    fireEvent.touchEnd(container);

    // ドラッグ終了後、ユーザーが外部画面で wheel 操作を行う
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    fireEvent.wheel(window);

    expect(cancelSpy).toHaveBeenCalled();

    document.body.removeChild(dummyEl);
    vi.useRealTimers();
  });

  it("スクロール位置が変化しない場合（スタック）、3フレームでアニメーションが即座に終了すること", () => {
    vi.useFakeTimers();

    const dummyEl = document.createElement("div");
    dummyEl.id = "index-group-な";
    dummyEl.getBoundingClientRect = vi.fn(() => ({
      top: 1500,
      bottom: 1550,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 1500,
      toJSON: () => {},
    }));
    document.body.appendChild(dummyEl);

    render(<IndexScrollBar availableGroups={groups} />);

    const button = screen.getByRole("button", { name: "な" });
    const container = button.closest("div[class*='fixed']") as HTMLElement;

    container.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 700,
      left: 300,
      right: 340,
      width: 40,
      height: 600,
      x: 300,
      y: 100,
      toJSON: () => {},
    }));

    // window.scrollY を固定値（動かないスタック状態を模擬）
    window.scrollY = 800;

    fireEvent.touchStart(container, {
      touches: [{ clientX: 320, clientY: 120 }],
    });
    fireEvent.touchMove(container, {
      touches: [{ clientX: 320, clientY: 500 }],
    });

    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");

    // 3フレーム分タイマーを進める（16ms * 3 = 48ms）
    vi.advanceTimersByTime(60);

    // スタックを検知して cancelAnimationFrame が呼ばれること
    expect(cancelSpy).toHaveBeenCalled();
    // スナップ用の scrollTo instant が呼ばれていること
    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "instant" }),
    );

    document.body.removeChild(dummyEl);
    vi.useRealTimers();
  });

  it("自前アニメーションが800msを超えた場合、タイムアウトにより確実に終了すること", () => {
    vi.useFakeTimers();

    const dummyEl = document.createElement("div");
    dummyEl.id = "index-group-さ";
    dummyEl.getBoundingClientRect = vi.fn(() => ({
      top: 1200,
      bottom: 1250,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 1200,
      toJSON: () => {},
    }));
    document.body.appendChild(dummyEl);

    render(<IndexScrollBar availableGroups={groups} />);

    const button = screen.getByRole("button", { name: "さ" });
    const container = button.closest("div[class*='fixed']") as HTMLElement;

    container.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 700,
      left: 300,
      right: 340,
      width: 40,
      height: 600,
      x: 300,
      y: 100,
      toJSON: () => {},
    }));

    fireEvent.touchStart(container, {
      touches: [{ clientX: 320, clientY: 120 }],
    });
    fireEvent.touchMove(container, {
      touches: [{ clientX: 320, clientY: 300 }],
    });

    // 850ms 経過させる
    vi.advanceTimersByTime(850);

    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "instant" }),
    );

    document.body.removeChild(dummyEl);
    vi.useRealTimers();
  });
});
