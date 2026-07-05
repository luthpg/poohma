import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";

export const getDashboardPrefsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const sort = getCookie("poohma_dashboard_sort") || "name-asc";
    const view = getCookie("poohma_dashboard_view") || "card";
    return { sort, view };
  },
);

export const setDashboardPrefsFn = createServerFn({ method: "POST" })
  .validator((data: { sort?: string; view?: string }) => data)
  .handler(async ({ data }) => {
    if (data.sort) {
      setCookie("poohma_dashboard_sort", data.sort, {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    if (data.view) {
      setCookie("poohma_dashboard_view", data.view, {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    return { success: true };
  });
