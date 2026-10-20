/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as admin_cms from "../admin/cms.js";
import type * as admin_contacts from "../admin/contacts.js";
import type * as admin_stats from "../admin/stats.js";
import type * as admin_system from "../admin/system.js";
import type * as admin_users from "../admin/users.js";
import type * as auditLogs from "../auditLogs.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as cryptoUtils from "../cryptoUtils.js";
import type * as customBuilders from "../customBuilders.js";
import type * as demo from "../demo.js";
import type * as extensionAuth from "../extensionAuth.js";
import type * as families from "../families.js";
import type * as http from "../http.js";
import type * as onboarding from "../onboarding.js";
import type * as records from "../records.js";
import type * as recovery from "../recovery.js";
import type * as rls from "../rls.js";
import type * as users from "../users.js";
import type * as viewLogs from "../viewLogs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  "admin/cms": typeof admin_cms;
  "admin/contacts": typeof admin_contacts;
  "admin/stats": typeof admin_stats;
  "admin/system": typeof admin_system;
  "admin/users": typeof admin_users;
  auditLogs: typeof auditLogs;
  contacts: typeof contacts;
  crons: typeof crons;
  cryptoUtils: typeof cryptoUtils;
  customBuilders: typeof customBuilders;
  demo: typeof demo;
  extensionAuth: typeof extensionAuth;
  families: typeof families;
  http: typeof http;
  onboarding: typeof onboarding;
  records: typeof records;
  recovery: typeof recovery;
  rls: typeof rls;
  users: typeof users;
  viewLogs: typeof viewLogs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
