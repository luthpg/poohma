import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { timingSafeEqual } from "./cryptoUtils";

const http = httpRouter();

http.route({
  path: "/getUserByFirebaseUid",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Convex側のenv var(npx convex env set / ダッシュボード)。
    const secret = request.headers.get("x-internal-secret");
    const internalSecret = process.env.CONVEX_INTERNAL_SECRET;
    if (
      !secret ||
      !internalSecret ||
      !timingSafeEqual(secret, internalSecret)
    ) {
      return new Response("Unauthorized", { status: 401 });
    }
    let body: { userId: string; accountId?: Id<"users"> } | null = null;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad Request: Invalid JSON", { status: 400 });
    }
    const userId = body?.userId;
    const accountId = body?.accountId;
    if (typeof userId !== "string") {
      return new Response("Bad Request: userId must be a string", {
        status: 400,
      });
    }
    if (accountId !== undefined && typeof accountId !== "string") {
      return new Response(
        "Bad Request: accountId must be a string or undefined",
        { status: 400 },
      );
    }
    const user = await ctx.runQuery(internal.users.getUserByFirebaseUid, {
      userId,
      accountId,
    });
    return new Response(JSON.stringify(user), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/resetDemoFamily",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = request.headers.get("x-internal-secret");
    const internalSecret = process.env.CONVEX_INTERNAL_SECRET;
    if (
      !secret ||
      !internalSecret ||
      !timingSafeEqual(secret, internalSecret)
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: {
      triggeredBy?: string;
      reason?: string;
      force?: boolean;
    } = {};

    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      return new Response("Bad Request: Invalid JSON", { status: 400 });
    }

    try {
      const result = await ctx.runMutation(
        internal.demo.resetDemoFamilyInternal,
        {
          triggeredBy:
            typeof body.triggeredBy === "string" ? body.triggeredBy : undefined,
          reason: typeof body.reason === "string" ? body.reason : undefined,
          force: typeof body.force === "boolean" ? body.force : undefined,
        },
      );

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (_err) {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
