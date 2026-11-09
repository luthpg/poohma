/**
 * ログインフォーム解析・ログインID抽出および要素判定モジュール
 *
 * 特定サイトに過学習せず、Web標準、セマンティクス、自然言語（日本語UI）、
 * DOM配置構造（パスワード欄との相対関係）、ユーザー操作（activeInput）を
 * 組み合わせた多層スコアリング方式によって柔軟かつ高精度に判定します。
 */

/**
 * パスワード入力欄（またはパスワード表示切り替え等の疑いがある欄）か判定
 */
export function isPasswordLikeInput(input: HTMLInputElement): boolean {
  if (input.type === "password") return true;
  const name = (input.name || "").toLowerCase();
  const id = (input.id || "").toLowerCase();
  const autocomplete = (input.autocomplete || "").toLowerCase();
  const placeholder = (input.placeholder || "").toLowerCase();
  const ariaLabel = (input.getAttribute("aria-label") || "").toLowerCase();

  return (
    name.includes("password") ||
    name.includes("passwd") ||
    id.includes("password") ||
    id.includes("passwd") ||
    autocomplete.includes("password") ||
    placeholder.includes("パスワード") ||
    placeholder.includes("password") ||
    ariaLabel.includes("パスワード") ||
    ariaLabel.includes("password")
  );
}

/**
 * 要素が可視状態にあるかを判定（非表示要素や不可視 hidden 要素の除外）
 */
function isElementVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.style.display === "none" || el.style.visibility === "hidden") {
    return false;
  }
  if (
    typeof window !== "undefined" &&
    typeof window.getComputedStyle === "function"
  ) {
    try {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    } catch {
      // ignore
    }
  }

  // 実ブラウザ環境でのみ offsetParent / position 判定を行う
  // （JSDOM ではレイアウトエンジンが存在しないため offsetParent は常に null となる）
  const isJsdom =
    typeof navigator !== "undefined" &&
    navigator.userAgent &&
    navigator.userAgent.includes("jsdom");

  if (!isJsdom && el.offsetParent === null) {
    // position: fixed 以外で offsetParent が null の場合は非表示
    try {
      const style = window.getComputedStyle(el);
      if (style.position !== "fixed") {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * ログインID入力欄として適格な input 要素であるかを判定（ノイズの完全遮断ハードゲート）
 */
export function isEligibleLoginIdInput(el: HTMLInputElement | null): boolean {
  if (!el) return false;
  if (el.disabled || el.readOnly) return false;

  // 1. type のホワイトリスト判定（テキスト系のみ許可）
  // hidden, checkbox, radio, submit, button, reset, image, file, password 等を一律遮断
  const type = (el.type || "text").toLowerCase();
  const allowedTypes = new Set(["text", "email", "tel", "url"]);
  if (!allowedTypes.has(type)) {
    return false;
  }

  // 2. パスワード類似要素の遮断
  if (isPasswordLikeInput(el)) {
    return false;
  }

  // 3. 検索バー・キャプチャ等の遮断
  const name = (el.name || "").toLowerCase();
  const id = (el.id || "").toLowerCase();
  const role = (el.getAttribute("role") || "").toLowerCase();
  if (
    type === "search" ||
    role === "searchbox" ||
    name.includes("search") ||
    id.includes("search") ||
    name.includes("captcha") ||
    id.includes("captcha") ||
    name.includes("turnstile") ||
    id.includes("turnstile")
  ) {
    return false;
  }

  // 4. 不可視要素の遮断
  if (!isElementVisible(el)) {
    return false;
  }

  return true;
}

/**
 * 入力要素の「ログインIDらしさ」を客観的にスコアリング
 */
export function scoreLoginIdInput(
  el: HTMLInputElement,
  form: HTMLFormElement | null,
  activeInput?: HTMLInputElement | null,
): number {
  let score = 0;

  // 1. ユーザー操作実績（最優先: 実際にフォーカス・入力されていた欄）
  if (activeInput && el === activeInput) {
    score += 100;
  }

  // 2. Web 標準規格 (W3C / WHATWG)
  const autocomplete = (el.autocomplete || "").toLowerCase();
  const type = (el.type || "text").toLowerCase();
  if (autocomplete === "username") {
    score += 50;
  } else if (autocomplete === "email") {
    score += 45;
  } else if (type === "email") {
    score += 40;
  } else if (autocomplete === "tel") {
    score += 35;
  } else if (type === "tel") {
    score += 30;
  }

  // 3. 名称・ID・プレースホルダーのセマンティクス
  const name = (el.name || "").toLowerCase();
  const id = (el.id || "").toLowerCase();
  const placeholder = (el.placeholder || "").toLowerCase();
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();

  // 単語境界・完全一致パターン (login_id, loginId, username, mail, account 等)
  const exactSemanticRegex =
    /(?:^|_|-)(?:login_?id|user_?id|username|user_?name|mail|email|account|geoid)(?:$|_|-)/i;
  if (exactSemanticRegex.test(name) || exactSemanticRegex.test(id)) {
    score += 35;
  } else if (
    name.includes("login") ||
    id.includes("login") ||
    name.includes("user") ||
    id.includes("user") ||
    name.includes("mail") ||
    id.includes("mail") ||
    name.includes("account") ||
    id.includes("account") ||
    name.includes("member") ||
    id.includes("member")
  ) {
    // 部分一致
    score += 20;
  }

  // 4. 自然言語・日本語 UI 表示 (placeholder, aria-label)
  const naturalLanguageRegex =
    /(?:メール|電話番号|携帯|ログイン|ユーザ|アカウント|会員番号|(?:^|[^a-z0-9])id(?:$|[^a-z0-9]))/i;
  if (
    naturalLanguageRegex.test(placeholder) ||
    naturalLanguageRegex.test(ariaLabel)
  ) {
    score += 25;
  }

  // 5. DOM 構造（同一フォーム内のパスワード欄との相対位置）
  if (form) {
    const passwordInputs = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    );
    if (passwordInputs.length > 0) {
      score += 10;
      // 最初のパスワード入力欄の直前にある適格テキスト欄か判定
      const firstPassword = passwordInputs[0];
      const allFormInputs = Array.from(
        form.querySelectorAll<HTMLInputElement>("input"),
      );
      const eligibleBeforePassword: HTMLInputElement[] = [];
      for (const input of allFormInputs) {
        if (input === firstPassword) break;
        if (isEligibleLoginIdInput(input)) {
          eligibleBeforePassword.push(input);
        }
      }
      if (
        eligibleBeforePassword.length > 0 &&
        eligibleBeforePassword[eligibleBeforePassword.length - 1] === el
      ) {
        // パスワード欄の直前にある最後の適格入力欄
        score += 25;
      }
    }
  }

  // 6. 値の品質
  const val = (el.value || "").trim();
  if (val.length > 0) {
    score += 5;
    if (val.includes("@")) {
      score += 15;
    }
  }

  return score;
}

/**
 * フォーム内から最高スコアのログインID入力要素を探索
 */
export function findLoginIdInput(
  formOrScope: ParentNode,
  activeInput?: HTMLInputElement | null,
): HTMLInputElement | null {
  const form =
    formOrScope instanceof HTMLFormElement
      ? formOrScope
      : formOrScope.querySelector("form");

  const inputs = Array.from(
    formOrScope.querySelectorAll<HTMLInputElement>("input"),
  );
  const eligibleInputs = inputs.filter(isEligibleLoginIdInput);

  if (eligibleInputs.length === 0) {
    return null;
  }

  let highestScore = -1;
  let bestCandidate: HTMLInputElement | null = null;

  for (const input of eligibleInputs) {
    const score = scoreLoginIdInput(input, form, activeInput);
    if (score > highestScore) {
      highestScore = score;
      bestCandidate = input;
    }
  }

  return bestCandidate;
}

/**
 * フォーム内から安全かつ柔軟にログインID文字列を抽出
 */
export function extractLoginIdFromForm(
  form: HTMLFormElement | null,
  activeInput?: HTMLInputElement | null,
): string {
  if (!form && typeof document !== "undefined") {
    form = document.querySelector("form");
  }
  if (!form) return "";

  // activeInput がこのフォーム内にあり、適格で値が入っている場合は最優先
  if (
    activeInput &&
    form.contains(activeInput) &&
    isEligibleLoginIdInput(activeInput)
  ) {
    const activeVal = activeInput.value.trim();
    if (activeVal.length > 0 && !activeVal.includes("\n")) {
      return activeVal;
    }
  }

  const bestInput = findLoginIdInput(form, activeInput);
  if (!bestInput) return "";

  const val = bestInput.value.trim();
  if (val.length > 0 && !val.includes("\n")) {
    return val;
  }

  return "";
}
