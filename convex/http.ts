import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/getUserByFirebaseUid",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Convex側のenv var(npx convex env set / ダッシュボード)。
    const secret = request.headers.get("x-internal-secret");
    if (!secret || secret !== process.env.CONVEX_INTERNAL_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const body = await request.json();
    const { userId, accountId } = body;
    if (typeof userId !== "string") {
      return new Response("Bad Request", { status: 400 });
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

export default http;
