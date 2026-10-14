import { z } from "zod";

/**
 * フォーム検知種別
 */
export const FormKindSchema = z.enum([
  "login",
  "register",
  "update",
  "unknown",
]);
export type FormKind = z.infer<typeof FormKindSchema>;

/**
 * Content Script -> Background: フォーム検知メッセージ
 */
export const FormDetectedMessageSchema = z.object({
  type: z.literal("CONTENT_FORM_DETECTED"),
  kind: FormKindSchema,
  detectedLoginId: z.string().max(256).optional(),
});
export type FormDetectedMessage = z.infer<typeof FormDetectedMessageSchema>;

/**
 * Content Script -> Background: フォーム操作開始通知
 */
export const FormInteractionMessageSchema = z.object({
  type: z.literal("CONTENT_FORM_INTERACTION"),
});
export type FormInteractionMessage = z.infer<
  typeof FormInteractionMessageSchema
>;

/**
 * Content Script -> Background: フォーム送信通知
 */
export const FormSubmittedMessageSchema = z.object({
  type: z.literal("CONTENT_FORM_SUBMITTED"),
  kind: FormKindSchema,
  submittedLoginId: z.string().max(256).optional(),
});
export type FormSubmittedMessage = z.infer<typeof FormSubmittedMessageSchema>;

/**
 * Content Script -> Background: フォーム消失通知
 */
export const FormGoneMessageSchema = z.object({
  type: z.literal("CONTENT_FORM_GONE"),
});
export type FormGoneMessage = z.infer<typeof FormGoneMessageSchema>;

/**
 * Background / SidePanel -> Content Script: ログインID自動入力要求
 */
export const FillLoginIdMessageSchema = z.object({
  type: z.literal("CONTENT_FILL_LOGIN_ID"),
  loginId: z.string().max(256),
});
export type FillLoginIdMessage = z.infer<typeof FillLoginIdMessageSchema>;

/**
 * UI / SW <-> Offscreen: 認証関連メッセージ
 */
export const AuthGetStateMessageSchema = z.object({
  type: z.literal("AUTH_GET_STATE"),
});

export const AuthSignInMessageSchema = z.object({
  type: z.literal("AUTH_SIGN_IN"),
  idToken: z.string(),
});

export const AuthSignOutMessageSchema = z.object({
  type: z.literal("AUTH_SIGN_OUT"),
});

export const AuthStateChangedMessageSchema = z.object({
  type: z.literal("AUTH_STATE_CHANGED"),
  isAuthenticated: z.boolean(),
  userId: z.string().nullable(),
  email: z.string().nullable(),
  accountId: z.string().nullable(),
});

/**
 * UI <-> Offscreen: 暗号・照合関連メッセージ
 */
export const VaultUnlockMessageSchema = z.object({
  type: z.literal("VAULT_UNLOCK"),
  passcode: z.string().min(1).max(256),
});

export const VaultLockMessageSchema = z.object({
  type: z.literal("VAULT_LOCK"),
});

export const VaultGetStatusMessageSchema = z.object({
  type: z.literal("VAULT_GET_STATUS"),
});

export const VaultDecryptHintMessageSchema = z.object({
  type: z.literal("VAULT_DECRYPT_HINT"),
  recordId: z.string(),
  credentialId: z.string(),
  passwordHint: z.string(),
  passwordHintIv: z.string(),
  passwordHintDekEncrypted: z.string(),
  passwordHintDekIv: z.string(),
});

/**
 * 全メッセージ型のUnion
 */
export const ExtensionMessageSchema = z.discriminatedUnion("type", [
  FormDetectedMessageSchema,
  FormInteractionMessageSchema,
  FormSubmittedMessageSchema,
  FormGoneMessageSchema,
  FillLoginIdMessageSchema,
  AuthGetStateMessageSchema,
  AuthSignInMessageSchema,
  AuthSignOutMessageSchema,
  AuthStateChangedMessageSchema,
  VaultUnlockMessageSchema,
  VaultLockMessageSchema,
  VaultGetStatusMessageSchema,
  VaultDecryptHintMessageSchema,
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
