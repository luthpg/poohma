// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  extractLoginIdFromForm,
  findLoginIdInput,
  isEligibleLoginIdInput,
  isPasswordLikeInput,
  scoreLoginIdInput,
} from "../lib/form-detection";

describe("form-detection (ログインID柔軟抽出・判定エンジン)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("isPasswordLikeInput", () => {
    it("type=password を正しく判定すること", () => {
      const input = document.createElement("input");
      input.type = "password";
      expect(isPasswordLikeInput(input)).toBe(true);
    });

    it("name や id や autocomplete に password/passwd が含まれる場合を検知すること", () => {
      const input1 = document.createElement("input");
      input1.name = "user_password_field";
      expect(isPasswordLikeInput(input1)).toBe(true);

      const input2 = document.createElement("input");
      input2.id = "current-passwd";
      expect(isPasswordLikeInput(input2)).toBe(true);

      const input3 = document.createElement("input");
      input3.autocomplete = "current-password";
      expect(isPasswordLikeInput(input3)).toBe(true);
    });

    it("通常のテキスト入力欄を誤検知しないこと", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.name = "login_id";
      expect(isPasswordLikeInput(input)).toBe(false);
    });
  });

  describe("isEligibleLoginIdInput", () => {
    it("テキスト系（text, email, tel, url, 未指定）を許可すること", () => {
      const text = document.createElement("input");
      text.type = "text";
      expect(isEligibleLoginIdInput(text)).toBe(true);

      const email = document.createElement("input");
      email.type = "email";
      expect(isEligibleLoginIdInput(email)).toBe(true);

      const tel = document.createElement("input");
      tel.type = "tel";
      expect(isEligibleLoginIdInput(tel)).toBe(true);

      const untyped = document.createElement("input");
      expect(isEligibleLoginIdInput(untyped)).toBe(true);
    });

    it("hidden, checkbox, radio 等の非テキスト系を遮断すること (GEOトラップ防止)", () => {
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "login_type_geoid";
      hidden.value = "1";
      expect(isEligibleLoginIdInput(hidden)).toBe(false);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "login_hold";
      checkbox.value = "1";
      expect(isEligibleLoginIdInput(checkbox)).toBe(false);

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.value = "1";
      expect(isEligibleLoginIdInput(radio)).toBe(false);
    });

    it("disabled や readOnly の要素を遮断すること", () => {
      const disabled = document.createElement("input");
      disabled.type = "text";
      disabled.disabled = true;
      expect(isEligibleLoginIdInput(disabled)).toBe(false);

      const readOnly = document.createElement("input");
      readOnly.type = "text";
      readOnly.readOnly = true;
      expect(isEligibleLoginIdInput(readOnly)).toBe(false);
    });

    it("検索バーやキャプチャを遮断すること", () => {
      const search = document.createElement("input");
      search.type = "search";
      expect(isEligibleLoginIdInput(search)).toBe(false);

      const searchRole = document.createElement("input");
      searchRole.setAttribute("role", "searchbox");
      expect(isEligibleLoginIdInput(searchRole)).toBe(false);

      const captcha = document.createElement("input");
      captcha.name = "g-recaptcha-response";
      expect(isEligibleLoginIdInput(captcha)).toBe(false);
    });

    it("非表示要素（display: none や visibility: hidden）を遮断すること", () => {
      const hiddenEl = document.createElement("input");
      hiddenEl.type = "text";
      hiddenEl.style.display = "none";
      expect(isEligibleLoginIdInput(hiddenEl)).toBe(false);

      const invisibleEl = document.createElement("input");
      invisibleEl.type = "text";
      invisibleEl.style.visibility = "hidden";
      expect(isEligibleLoginIdInput(invisibleEl)).toBe(false);
    });
  });

  describe("GEO Online 実装パターンの抽出テスト (.local/geo.html 相当)", () => {
    it("先頭 hidden や末尾 checkbox の value=1 を誤検知せず、本命の login_id 入力値を正確に抽出できること", () => {
      const form = document.createElement("form");
      form.id = "loginForm";
      form.innerHTML = `
        <input type="hidden" name="login_type_geoid" value="1">
        <dl class="loginFormInput">
          <dt>メールアドレスまたは携帯電話番号</dt>
          <dd>
            <input type="text" name="login_id" id="loginId" value="09012345678">
          </dd>
          <dt>パスワード</dt>
          <dd>
            <input type="password" name="password" id="password" value="my_secret_pw">
          </dd>
          <dt class="clearfix">
            <label><input type="checkbox" name="login_hold" value="1" checked>次回から自動ログインする</label>
          </dt>
        </dl>
        <button type="submit" id="loginBtn">ログイン</button>
      `;
      document.body.appendChild(form);

      const loginId = extractLoginIdFromForm(form);
      expect(loginId).toBe("09012345678");

      const targetInput = findLoginIdInput(form);
      expect(targetInput?.id).toBe("loginId");
    });
  });

  describe("Web標準およびモダンフォームのテスト", () => {
    it("autocomplete=username や type=email の要素を最優先で特定できること", () => {
      const form = document.createElement("form");
      form.innerHTML = `
        <input type="text" name="company_name" value="Acme Corp">
        <input type="email" autocomplete="username" name="email" value="developer@example.com">
        <input type="password" name="password" value="secret">
      `;
      document.body.appendChild(form);

      const loginId = extractLoginIdFromForm(form);
      expect(loginId).toBe("developer@example.com");
    });
  });

  describe("日本語UI / 自然言語プレースホルダーのテスト", () => {
    it("属性名が無意味な英数コードでも、placeholder の日本語表示から高スコア判定できること", () => {
      const form = document.createElement("form");
      form.innerHTML = `
        <input type="text" name="field_a982" placeholder="会社名" value="テスト会社">
        <input type="text" name="field_b103" placeholder="ログインID または 会員番号" value="MEMBER-12345">
        <input type="password" name="field_c441" placeholder="パスワード" value="secret">
      `;
      document.body.appendChild(form);

      const loginId = extractLoginIdFromForm(form);
      expect(loginId).toBe("MEMBER-12345");
    });
  });

  describe("レガシー難読化フォーム（パスワード直前フォールバック）のテスト", () => {
    it("属性名に一切ヒントがない場合でも、パスワード欄直前の可視テキスト欄を特定できること", () => {
      const form = document.createElement("form");
      form.innerHTML = `
        <input type="text" name="input_1" value="dummy1">
        <input type="text" name="input_2" value="legacy_user">
        <input type="password" name="input_3" value="secret">
      `;
      document.body.appendChild(form);

      const loginId = extractLoginIdFromForm(form);
      expect(loginId).toBe("legacy_user");
    });
  });

  describe("ユーザー操作実績（activeInput）優先のテスト", () => {
    it("activeInput が指定されている場合、適格であれば最優先でその値が採用されること", () => {
      const form = document.createElement("form");
      form.innerHTML = `
        <input type="text" name="username" value="default_user">
        <input type="text" name="custom_login_field" value="active_custom_user">
        <input type="password" name="password" value="secret">
      `;
      document.body.appendChild(form);

      const activeEl = form.querySelector<HTMLInputElement>(
        'input[name="custom_login_field"]',
      );
      const loginId = extractLoginIdFromForm(form, activeEl);
      expect(loginId).toBe("active_custom_user");
    });
  });

  describe("パスワード値の完全非漏洩", () => {
    it("ログインID欄が存在しない、または空の場合でも、パスワード欄の値は絶対に返さないこと", () => {
      const form = document.createElement("form");
      form.innerHTML = `
        <input type="password" name="password" value="super_sensitive_password">
      `;
      document.body.appendChild(form);

      const loginId = extractLoginIdFromForm(form);
      expect(loginId).toBe("");
    });
  });
});

describe("natural language ID tokens", () => {
  for (const attribute of ["placeholder", "aria-label"]) {
    it.each(["Middle name", "valid", "ID123", "123id", "identity"])(
      `${attribute}: %s does not add an ID score`,
      (label) => {
        const input = document.createElement("input");
        input.setAttribute(attribute, label);
        expect(scoreLoginIdInput(input, null)).toBe(0);
      },
    );
    it.each([
      "ID",
      "id",
      "Id",
      "Login ID",
      "user_id",
      "ログインID",
      "ユーザー",
      "ユーザ",
      "メール",
      "電話番号",
      "携帯",
      "アカウント",
      "会員番号",
    ])(`${attribute}: %s adds a semantic score`, (label) => {
      const input = document.createElement("input");
      input.setAttribute(attribute, label);
      expect(scoreLoginIdInput(input, null)).toBe(25);
    });
  }
});
