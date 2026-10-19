import { http, HttpResponse } from "msw";

let revalidatedPaths: string[] = [];

export const resetRevalidatedPaths = () => {
  revalidatedPaths = [];
};

/** Pages the app asked to regenerate through /api/revalidate, in order. */
export const getRevalidatedPaths = () => revalidatedPaths;

export const revalidateHandlers = [
  http.post("http://localhost:3000/api/revalidate", async ({ request }) => {
    if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_KEY}`) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { paths } = (await request.json()) as { paths: string[] };
    revalidatedPaths.push(...paths);
    return HttpResponse.json({ revalidated: paths, failed: [] });
  })
];
