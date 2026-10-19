import { captureException } from "@sentry/nextjs";
import { env } from "~/env.mjs";
import { PATHS } from "~/utils/constants";

/** The cached pages that show away trips and their free seats. */
export const awayGamePaths = (eventIds: string[]) => [
  "/",
  "/bortaresor",
  ...eventIds.map((id) => `${PATHS.awayGames}${id}`)
];

/**
 * Regenerates cached (ISR) pages now instead of when their `revalidate` time runs out.
 *
 * Only a Pages Router API route can call `res.revalidate`, so this goes through
 * /api/revalidate. Best effort: a failure is reported but never thrown, and the
 * pages then update on their own schedule.
 */
export const revalidatePages = async (paths: string[]) => {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) {
    return;
  }
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_WEBSITE_URL}/api/revalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.CRON_KEY}`
      },
      body: JSON.stringify({ paths: uniquePaths }),
      signal: AbortSignal.timeout(5_000)
    });
    if (!res.ok) {
      throw new Error(`Revalidating ${uniquePaths.join(", ")} failed with status ${res.status}`);
    }
  } catch (err) {
    captureException(err);
  }
};
